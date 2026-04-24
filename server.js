import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"
import fs from "fs"
import os from "os"
import path from "path"

const app = express()
app.use(express.json())

ffmpeg.setFfmpegPath(ffmpegPath)

// 🔥 chống crash toàn server
process.on("uncaughtException", err => {
  console.error("🔥 UNCAUGHT:", err)
})
process.on("unhandledRejection", err => {
  console.error("🔥 PROMISE ERROR:", err)
})

// 👉 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})


// ===============================
// 🎥 CHẤM VIDEO (FIX FULL)
// ===============================
app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    if (!video_url) {
      return res.json({ feedback: "❌ Thiếu video" })
    }

    console.log("🎥 VIDEO:", video_url)

    // ==============================
    // ✅ DOWNLOAD VIDEO
    // ==============================
    let buffer

    try {
      const videoRes = await axios.get(video_url, {
        responseType: "arraybuffer",
        timeout: 60000
      })

      buffer = Buffer.from(videoRes.data)

      console.log("✅ Download OK:", buffer.length)

    } catch (err) {
      console.error("❌ DOWNLOAD ERROR:", err)
      return res.json({ feedback: "❌ Không tải được video" })
    }

    // ❗ chặn file quá lớn (tránh crash)
    if (buffer.length > 50 * 1024 * 1024) {
      return res.json({
        feedback: "❌ Video quá dài (giới hạn ~5 phút)"
      })
    }

    // ==============================
    // ✅ CONVERT VIDEO → AUDIO (AN TOÀN)
    // ==============================
    const tempDir = os.tmpdir()
    const inputPath = path.join(tempDir, "input.mp4")
    const outputPath = path.join(tempDir, "audio.mp3")

    try {
      fs.writeFileSync(inputPath, buffer)

      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .noVideo()
          .audioCodec("libmp3lame")
          .format("mp3")
          .on("end", resolve)
          .on("error", (err) => {
            console.error("❌ FFMPEG ERROR:", err)
            reject(err)
          })
          .save(outputPath)
      })

      console.log("🎧 Convert audio OK")

    } catch (err) {
      console.error("❌ CONVERT ERROR:", err)
      return res.json({
        feedback: "❌ Video lỗi hoặc không xử lý được"
      })
    }

    // ==============================
    // ✅ ĐỌC AUDIO
    // ==============================
    let audioBuffer

    try {
      audioBuffer = fs.readFileSync(outputPath)
    } catch (err) {
      return res.json({
        feedback: "❌ Không đọc được audio"
      })
    }

    // ==============================
    // ✅ TRANSCRIBE
    // ==============================
    let transcript = ""

    try {
      const formData = new FormData()
      formData.append("file", audioBuffer, {
        filename: "audio.mp3"
      })
      formData.append("model", "gpt-4o-transcribe")

      const transcriptRes = await axios.post(
        "https://api.openai.com/v1/audio/transcriptions",
        formData,
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            ...formData.getHeaders()
          },
          timeout: 60000
        }
      )

      transcript = transcriptRes.data.text || ""

      console.log("📝 TEXT:", transcript)

    } catch (err) {
      console.error("❌ TRANSCRIBE ERROR:", err.response?.data || err.message)
      return res.json({
        feedback: "❌ Không nhận diện được giọng nói"
      })
    }

    if (!transcript) {
      return res.json({
        feedback: "❌ Không nghe rõ, con nói lại nhé!"
      })
    }

    // ==============================
    // 🤖 AI CHẤM (LEVEL GIÁO VIÊN)
    // ==============================
    let feedback = "❌ Không chấm được"

    try {
      const analysis = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `
Bạn là GIÁO VIÊN AI của trung tâm KAISA.

- Nhận xét như giáo viên thật
- Dễ hiểu cho trẻ em
- Không dùng từ khó
- Luôn động viên
- Không đoán nếu không chắc
- Tổng nội dung < 120 từ
`
          },
          {
            role: "user",
            content: `
"${transcript}"

Chấm:
- Phát âm
- Trôi chảy
- Ngữ pháp
- Từ vựng

+ tổng điểm
+ lỗi chính
+ cách cải thiện
+ câu mẫu tốt hơn
`
          }
        ]
      })

      feedback =
        analysis.choices?.[0]?.message?.content || "Không có kết quả"

    } catch (err) {
      console.error("❌ AI ERROR:", err)
      feedback = "❌ Lỗi AI"
    }

    // tránh lỗi Zalo
    if (feedback.length > 1200) {
      feedback = feedback.slice(0, 1200)
    }

    console.log("📊 FEEDBACK:", feedback)

    // ==============================
    // ✅ TRẢ KẾT QUẢ
    // ==============================
    return res.json({
      transcript,
      feedback
    })

  } catch (err) {
    console.error("❌ SYSTEM ERROR:", err)

    return res.json({
      feedback: "❌ Lỗi hệ thống"
    })
  }
})


// ===============================
// 💬 CHAT AI GIA SƯ
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { text } = req.body

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên AI của KAISA.

- Nếu học sinh nói tiếng Việt → trả lời tiếng Việt
- Nếu nói tiếng Anh → trả lời tiếng Anh
- Giải thích đơn giản, dễ hiểu
- Thân thiện
`
        },
        {
          role: "user",
          content: text
        }
      ]
    })

    res.json({
      reply: response.choices[0].message.content
    })

  } catch (err) {
    console.error("❌ CHAT ERROR:", err)

    res.json({
      reply: "❌ Cô chưa trả lời được"
    })
  }
})


// ===============================
app.get("/", (req, res) => {
  res.send("🚀 KAISA AI running")
})

// ===============================
const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
