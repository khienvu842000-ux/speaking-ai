import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"
import fs from "fs"

const app = express()
app.use(express.json())

ffmpeg.setFfmpegPath(ffmpegPath)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===============================
// 🎥 CHẤM VIDEO
// ===============================
app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    const videoRes = await axios.get(video_url, {
      responseType: "arraybuffer",
      timeout: 60000
    })

    const buffer = Buffer.from(videoRes.data)

    const input = "/tmp/input.mp4"
    const output = "/tmp/audio.mp3"

    fs.writeFileSync(input, buffer)

    await new Promise((resolve, reject) => {
      ffmpeg(input)
        .noVideo()
        .audioCodec("libmp3lame")
        .format("mp3")
        .on("end", resolve)
        .on("error", reject)
        .save(output)
    })

    const audio = fs.readFileSync(output)

    const formData = new FormData()
    formData.append("file", audio, { filename: "audio.mp3" })
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

    const transcript = transcriptRes.data.text || ""

    // 🤖 CHẤM BÀI
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên AI KAISA.

- Nhận xét dễ hiểu
- Chấm chuẩn giáo viên thật
- Có sửa lỗi phát âm, ngữ pháp
- Hỗ trợ trẻ em
`
        },
        {
          role: "user",
          content: `
"${transcript}"

Chấm chi tiết:
- phát âm
- trôi chảy
- ngữ pháp
- từ vựng

+ tổng điểm
+ lỗi chính
+ cách cải thiện
+ câu mẫu tốt hơn
`
        }
      ]
    })

    let feedback = analysis.choices[0].message.content

    if (feedback.length > 1200) {
      feedback = feedback.slice(0, 1200)
    }

    res.json({
      transcript,
      feedback
    })

  } catch (err) {
    console.error(err)
    res.json({ feedback: "❌ Lỗi xử lý video" })
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
Bạn là giáo viên AI của trung tâm KAISA.

- Nếu học sinh nói tiếng Việt → trả lời tiếng Việt
- Nếu nói tiếng Anh → trả lời tiếng Anh
- Giải thích dễ hiểu
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
      reply: "Cô chưa trả lời được 😥"
    })
  }
})

// ===============================
app.get("/", (req, res) => {
  res.send("🚀 AI KAISA đang chạy")
})

app.listen(process.env.PORT || 8080)
