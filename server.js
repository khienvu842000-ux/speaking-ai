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

// 🔥 chống crash
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


// ========================================
// 🎥 API CHẤM VIDEO (IPA + GIÁO VIÊN THẬT)
// ========================================
app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    if (!video_url) {
      return res.json({ feedback: "❌ Thiếu video" })
    }

    console.log("🎥 VIDEO:", video_url)

    // ======================
    // 1. DOWNLOAD
    // ======================
    let buffer
    try {
      const videoRes = await axios.get(video_url, {
        responseType: "arraybuffer",
        timeout: 60000
      })
      buffer = Buffer.from(videoRes.data)
    } catch (err) {
      return res.json({ feedback: "❌ Không tải được video" })
    }

    // ❗ giới hạn an toàn
    if (buffer.length > 50 * 1024 * 1024) {
      return res.json({
        feedback: "❌ Video quá dài (tối đa ~5 phút)"
      })
    }

    // ======================
    // 2. CONVERT → AUDIO
    // ======================
    const inputPath = path.join(os.tmpdir(), "input.mp4")
    const outputPath = path.join(os.tmpdir(), "audio.mp3")

    try {
      fs.writeFileSync(inputPath, buffer)

      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .noVideo()
          .audioCodec("libmp3lame")
          .format("mp3")
          .on("end", resolve)
          .on("error", reject)
          .save(outputPath)
      })
    } catch (err) {
      return res.json({
        feedback: "❌ Video lỗi hoặc không xử lý được"
      })
    }

    const audioBuffer = fs.readFileSync(outputPath)

    // ======================
    // 3. TRANSCRIBE
    // ======================
    let transcript = ""

    try {
      const formData = new FormData()
      formData.append("file", audioBuffer, {
        filename: "audio.mp3"
      })
      formData.append("model", "gpt-4o-transcribe")

      const result = await axios.post(
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

      transcript = result.data.text || ""
    } catch (err) {
      return res.json({
        feedback: "❌ Không nhận diện được giọng nói"
      })
    }

    if (!transcript) {
      return res.json({
        feedback: "❌ Không nghe rõ, con nói lại nhé!"
      })
    }

    console.log("📝 TEXT:", transcript)

    // ======================
    // 4. AI CHẤM IPA LEVEL CAO
    // ======================
    let feedback = "❌ Không chấm được"

    try {
      const analysis = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `
Bạn là GIÁO VIÊN PHÁT ÂM CHUYÊN SÂU (IPA) của trung tâm KAISA.

Nguyên tắc:
- Phân tích như giáo viên thật
- Chỉ ra lỗi phát âm nếu chắc chắn
- Không đoán nếu không rõ
- Dùng từ dễ hiểu cho trẻ
- Luôn động viên
- Tổng nội dung < 150 từ
`
          },
          {
            role: "user",
            content: `
Bài nói:
"${transcript}"

Hãy chấm:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10
- Trôi chảy: x/10
- Ngữ pháp: x/10
- Từ vựng: x/10

👉 Tổng điểm: x/10

🔊 PHÁT ÂM CHI TIẾT:
- 1 lỗi rõ nhất (IPA nếu có)
- cách sửa

📌 NHẬN XÉT:
(1 câu khen + 1 góp ý)

❌ LỖI CHÍNH:
- 1 câu sai → sửa lại

📈 CẦN CẢI THIỆN:
- 2 điểm

💡 BÀI TẬP:
- 1 bài luyện

💡 CÂU MẪU:
- 1 câu tốt hơn

⭐ ĐÁNH GIÁ:
⭐ 1–5

👉 Kết thúc:
"Giáo viên AI KAISA luôn đồng hành cùng con 💙"
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


// ========================================
// 💬 CHAT AI GIA SƯ (VIỆT + ANH)
// ========================================
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

- Học sinh nói tiếng Việt → trả lời tiếng Việt
- Học sinh nói tiếng Anh → trả lời tiếng Anh
- Giải thích đơn giản
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
    res.json({
      reply: "❌ Cô chưa trả lời được"
    })
  }
})


// ========================================
app.get("/", (req, res) => {
  res.send("🚀 KAISA AI running")
})

const PORT = process.env.PORT || 8080

app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
