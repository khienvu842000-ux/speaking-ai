import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"

const app = express()
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    console.log("VIDEO:", video_url)

    // 👉 1. tải video từ Zalo
    const videoRes = await axios.get(video_url, {
      responseType: "arraybuffer"
    })

    const buffer = Buffer.from(videoRes.data)

    // 👉 2. gửi audio/video sang OpenAI (speech → text)
    const formData = new FormData()
    formData.append("file", buffer, "audio.mp4")
    formData.append("model", "gpt-4o-transcribe")

    const transcriptRes = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders()
        }
      }
    )

    const transcript = transcriptRes.data.text

    console.log("TEXT:", transcript)

    // 👉 3. AI chấm speaking
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Bạn là giáo viên tiếng Anh cho học sinh tiểu học"
        },
        {
          role: "user",
          content: `
Bài nói: ${transcript}

Hãy:
- chấm điểm (0-10)
- nhận xét dễ hiểu
- sửa lỗi sai
- gợi ý cải thiện
`
        }
      ]
    })

    const feedback = analysis.choices[0].message.content

    res.json({
      transcript,
      feedback
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ feedback: "❌ Lỗi xử lý video" })
  }
})

// 👉 QUAN TRỌNG: Railway cần PORT này
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log("Server chạy ở port", PORT)
})
