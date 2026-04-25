import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"

console.log("🔥 APP STARTING...")

const app = express()
app.use(express.json())

// 👉 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ==============================
// 🎥 CHẤM SPEAKING (STREAM - KHÔNG BỊ KILL)
// ==============================
app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    if (!video_url) {
      return res.status(400).json({ error: "Thiếu video_url" })
    }

    console.log("🎥 VIDEO:", video_url)

    // 🔥 STREAM (không dùng buffer)
    const videoRes = await axios.get(video_url, {
      responseType: "stream",
      timeout: 20000
    })

    const size = Number(videoRes.headers["content-length"] || 0)

    if (size > 20 * 1024 * 1024) {
      return res.json({
        feedback: "⚠️ Video quá dài, gửi dưới 2 phút nhé!"
      })
    }

    // ==============================
    // TRANSCRIBE
    // ==============================
    const formData = new FormData()
    formData.append("file", videoRes.data, {
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
        timeout: 20000
      }
    )

    const transcript = transcriptRes.data.text || ""

    console.log("📝 TEXT:", transcript)

    if (!transcript) {
      return res.json({
        feedback: "❌ Không nghe rõ, con nói lại nhé!"
      })
    }

    // ==============================
    // AI CHẤM (LEVEL GIÁO VIÊN)
    // ==============================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên AI KAISA.

- Nhận xét dễ hiểu cho học sinh
- Ưu tiên lỗi quan trọng nhất
- Không dùng từ khó
- Tổng nội dung <150 từ
`
        },
        {
          role: "user",
          content: `
"${transcript}"

Hãy chấm:
- phát âm
- trôi chảy
- ngữ pháp
- từ vựng

+ tổng điểm
+ lỗi chính
+ cách sửa
+ gợi ý cải thiện
+ 1 câu mẫu tốt hơn
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
      feedback: "⚠️ Lỗi xử lý, thử lại video ngắn hơn nhé!"
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
- Giải thích đơn giản
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
    console.error("❌ CHAT ERROR:", err)
    return res.json({
      reply: "❌ Lỗi AI"
    })
  }
})

// ==============================
// TEST
// ==============================
app.get("/", (req, res) => {
  res.send("🚀 KAISA AI OK")
})

// ==============================
// 🔥 FIX RAILWAY (QUAN TRỌNG NHẤT)
// ==============================
const PORT = process.env.PORT

if (!PORT) {
  console.error("❌ PORT undefined")
  process.exit(1)
}

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 SERVER READY:", PORT)
})
