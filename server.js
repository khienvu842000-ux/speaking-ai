import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"
import fs from "fs"
import ffmpeg from "fluent-ffmpeg"

const app = express()
app.use(express.json())

// 🔥 debug
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

// ==============================
// 🎥 API CHẤM SPEAKING
// ==============================
app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    if (!video_url) {
      return res.status(400).json({ error: "Thiếu video_url" })
    }

    console.log("🎥 VIDEO:", video_url)

    // ==========================
    // 1. DOWNLOAD VIDEO
    // ==========================
    const videoRes = await axios.get(video_url, {
      responseType: "arraybuffer",
      timeout: 30000
    })

    const inputPath = "./input.mp4"
    const outputPath = "./audio.mp3"

    fs.writeFileSync(inputPath, videoRes.data)

    // ==========================
    // 2. CONVERT AUDIO (FFMPEG)
    // ==========================
    const convertPromise = new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .format("mp3")
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath)
    })

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("FFMPEG TIMEOUT")), 20000)
    )

    await Promise.race([convertPromise, timeout])

    const audioBuffer = fs.readFileSync(outputPath)

    // 🔥 dọn file
    fs.unlinkSync(inputPath)
    fs.unlinkSync(outputPath)

    // ==========================
    // 3. CHIA CHUNK TRANSCRIBE
    // ==========================
    const chunkSize = 2 * 1024 * 1024
    let fullTranscript = ""

    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, i + chunkSize)

      const formData = new FormData()
      formData.append("file", chunk, { filename: "audio.mp3" })
      formData.append("model", "gpt-4o-transcribe")

      const resTrans = await axios.post(
        "https://api.openai.com/v1/audio/transcriptions",
        formData,
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            ...formData.getHeaders()
          },
          timeout: 30000
        }
      )

      fullTranscript += resTrans.data.text + " "
    }

    console.log("📝 TEXT:", fullTranscript)

    if (!fullTranscript || fullTranscript.length < 5) {
      return res.json({
        feedback: "❌ Con nói nhỏ quá hoặc chưa rõ, thử lại nhé!"
      })
    }

    // ==========================
    // 4. AI CHẤM (LEVEL GIÁO VIÊN)
    // ==========================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
Bạn là GIÁO VIÊN AI của trung tâm KAISA (10 năm kinh nghiệm).

- Nhận xét như giáo viên thật
- Ưu tiên lỗi quan trọng nhất
- Ngôn ngữ đơn giản cho trẻ
- Không đoán phát âm nếu không chắc
- Tổng nội dung <150 từ
`
        },
        {
          role: "user",
          content: `
Bài nói:
"${fullTranscript}"

Hãy đánh giá:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10
- Trôi chảy: x/10
- Ngữ pháp: x/10
- Từ vựng: x/10
👉 Tổng điểm: x/10

🔊 PHÁT ÂM (IPA):
- 1 từ sai rõ nhất (kèm IPA)
- cách sửa

📌 NGỮ PHÁP:
- lỗi quan trọng nhất

❌ CÂU SAI:
- viết lại → sửa

📈 CẦN CẢI THIỆN:
- 2 điểm cụ thể

💡 LUYỆN TẬP:
- 1 cách luyện

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

    let feedback =
      analysis.choices?.[0]?.message?.content || "Không có kết quả"

    if (feedback.length > 1200) {
      feedback = feedback.slice(0, 1200)
    }

    console.log("📊 FEEDBACK:", feedback)

    return res.json({
      transcript: fullTranscript,
      feedback
    })

  } catch (err) {
    console.error("❌ ERROR:", err.message)

    return res.json({
      feedback: "⚠️ Video hơi dài hoặc lỗi kỹ thuật, thử lại video ngắn hơn nhé!"
    })
  }
})

// ==============================
// 💬 CHAT AI (GIA SƯ)
// ==============================
app.post("/api/chat", async (req, res) => {
  try {
    const { text } = req.body

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên AI của KAISA.

- Hỏi tiếng Việt → trả lời tiếng Việt
- Hỏi tiếng Anh → trả lời tiếng Anh
- Giải thích đơn giản cho trẻ 6-12 tuổi
- Luôn thân thiện
`
        },
        {
          role: "user",
          content: text
        }
      ]
    })

    return res.json({
      reply: ai.choices?.[0]?.message?.content
    })

  } catch (err) {
    return res.json({
      reply: "❌ Lỗi AI"
    })
  }
})

// ==============================
// TEST
// ==============================
app.get("/", (req, res) => {
  res.send("🚀 KAISA AI chạy OK")
})

// ==============================
const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
