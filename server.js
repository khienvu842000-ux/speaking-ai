import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"

const app = express()
app.use(express.json())

// 👉 Khởi tạo OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// 👉 API chấm speaking
app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    if (!video_url) {
      return res.status(400).json({ error: "Thiếu video_url" })
    }

    console.log("🎥 VIDEO:", video_url)

    // 👉 1. tải video
    const videoRes = await axios.get(video_url, {
      responseType: "arraybuffer"
    })

    const buffer = Buffer.from(videoRes.data)

    // 👉 2. chuyển speech → text
    const formData = new FormData()
    formData.append("file", buffer, {
      filename: "audio.mp4",
      contentType: "audio/mp4"
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
        maxBodyLength: Infinity
      }
    )

    const transcript = transcriptRes.data.text || ""

    console.log("📝 TEXT:", transcript)

    if (!transcript) {
      return res.json({
        feedback: "❌ Không nhận diện được giọng nói"
      })
    }

    // 👉 3. AI chấm bài
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Bạn là giáo viên tiếng Anh tiểu học. Nhận xét dễ hiểu, thân thiện với trẻ."
        },
        {
          role: "user",
          content: `
Bài nói: ${transcript}

Hãy:
- Chấm điểm (0-10)
- Nhận xét ngắn gọn
- Chỉ ra lỗi sai
- Gợi ý cải thiện
`
        }
      ]
    })

    const feedback =
      analysis.choices?.[0]?.message?.content || "Không có phản hồi"

    return res.json({
      transcript,
      feedback
    })

  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message)

    return res.status(500).json({
      error: "Lỗi xử lý video",
      detail: err.response?.data || err.message
    })
  }
})

// 👉 PORT cho Railway
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
