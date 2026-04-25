import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"

const app = express()
app.use(express.json())

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

// ==============================
// 🎥 CHẤM SPEAKING (KHÔNG FFMPEG)
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

    const buffer = Buffer.from(videoRes.data)

    console.log("✅ Download:", buffer.length)

    // ==========================
    // 2. TRANSCRIBE TRỰC TIẾP
    // ==========================
    const formData = new FormData()
    formData.append("file", buffer, {
      filename: "audio.mp4"
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
        timeout: 30000
      }
    )

    const transcript = transcriptRes.data.text || ""

    console.log("📝 TEXT:", transcript)

    if (!transcript || transcript.length < 5) {
      return res.json({
        feedback: "❌ Con nói chưa rõ, thử lại nhé!"
      })
    }

    // ==========================
    // 3. AI CHẤM (LEVEL GIÁO VIÊN)
    // ==========================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên AI của trung tâm KAISA.

- Nhận xét như giáo viên thật
- Ưu tiên lỗi quan trọng nhất
- Ngôn ngữ đơn giản cho trẻ
- Không đoán phát âm nếu không chắc
- Nội dung <150 từ
`
        },
        {
          role: "user",
          content: `
Bài nói:
"${transcript}"

Hãy đánh giá:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10
- Trôi chảy: x/10
- Ngữ pháp: x/10
- Từ vựng: x/10
👉 Tổng điểm: x/10

🔊 PHÁT ÂM:
- 1 lỗi rõ nhất + cách sửa

📌 NGỮ PHÁP:
- lỗi chính

❌ CÂU SAI:
- sửa lại

📈 CẦN CẢI THIỆN:
- 2 điểm

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
      transcript,
      feedback
    })

  } catch (err) {
    console.error("❌ ERROR:", err.message)

    return res.json({
      feedback: "⚠️ Video lỗi hoặc quá dài, thử lại nhé!"
    })
  }
})

// ==============================
// 💬 CHAT AI
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
Bạn là giáo viên AI KAISA.
- Hỏi tiếng Việt → trả lời tiếng Việt
- Hỏi tiếng Anh → trả lời tiếng Anh
- Giải thích đơn giản, thân thiện
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

  } catch {
    return res.json({ reply: "❌ Lỗi AI" })
  }
})

// ==============================
app.get("/", (req, res) => {
  res.send("🚀 KAISA AI OK")
})

// ==============================
const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
