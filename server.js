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

// 🔥 debug crash
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
// 🚀 API CHÍNH
// ==============================
app.post("/api/grade-speaking", async (req, res) => {
  try {
    const { video_url } = req.body

    if (!video_url) {
      return res.status(400).json({ error: "Thiếu video_url" })
    }

    console.log("🎥 VIDEO:", video_url)

    // ==============================
    // ✅ 1. DOWNLOAD VIDEO
    // ==============================
    const videoRes = await axios.get(video_url, {
      responseType: "arraybuffer",
      timeout: 30000
    })

    const buffer = Buffer.from(videoRes.data)
    console.log("✅ Download OK:", buffer.length)

    // ==============================
    // ✅ 2. CONVERT VIDEO → AUDIO
    // ==============================
    const inputPath = "/tmp/input.mp4"
    const outputPath = "/tmp/audio.mp3"

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

    const audioBuffer = fs.readFileSync(outputPath)

    console.log("🎧 Convert audio OK")

    // ==============================
    // ✅ 3. TRANSCRIBE
    // ==============================
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

    const transcript = transcriptRes.data.text || ""

    console.log("📝 TEXT:", transcript)

    if (!transcript) {
      return res.json({
        feedback: "❌ Không nghe rõ, con nói lại nhé!"
      })
    }

    // ==============================
    // ✅ 4. AI CHẤM (LEVEL GIÁO VIÊN)
    // ==============================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
Bạn là GIÁO VIÊN AI của trung tâm Anh ngữ KAISA.

Nguyên tắc:
- Nhận xét như giáo viên thật
- Ưu tiên sửa lỗi quan trọng
- Không dùng từ khó
- Luôn động viên học sinh
- Không đoán nếu không chắc
- Tổng nội dung < 120 từ

Thang điểm:
0–4 yếu
5–6 trung bình
7–8 khá
9–10 tốt
`
        },
        {
          role: "user",
          content: `
Bài nói:
"${transcript}"

Hãy chấm theo format:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10
- Trôi chảy: x/10
- Ngữ pháp: x/10
- Từ vựng: x/10

👉 Tổng điểm: x/10

📌 NHẬN XÉT:
(1 câu khen + 1 câu góp ý)

🔊 PHÁT ÂM:
- chỉ ra lỗi phát âm rõ nhất (vd: /θ/, /s/)
- nếu không chắc: "Phát âm khá rõ"

📌 NGỮ PHÁP:
- lỗi chính

❌ LỖI TRỌNG TÂM:
- câu sai → sửa đúng

📈 CẦN CẢI THIỆN:
- 2 điểm cụ thể

💡 BÀI TẬP:
- 1 cách luyện đơn giản

💡 CÂU MẪU:
- 1 câu tốt hơn

⭐ ĐÁNH GIÁ:
- ⭐ 1–5

👉 Kết thúc:
"Giáo viên AI KAISA luôn đồng hành cùng con 💙"
`
        }
      ]
    })

    let feedback =
      analysis.choices?.[0]?.message?.content || "Không có phản hồi"

    // 👉 tránh lỗi Zalo
    if (feedback.length > 1200) {
      feedback = feedback.slice(0, 1200)
    }

    console.log("📊 FEEDBACK:", feedback)

    // ==============================
    // ✅ 5. TRẢ KẾT QUẢ
    // ==============================
    return res.json({
      transcript,
      feedback
    })

  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message)

    return res.status(500).json({
      error: "Lỗi xử lý",
      detail: err.response?.data || err.message
    })
  }
})

// 👉 test
app.get("/", (req, res) => {
  res.send("🚀 Speaking AI KAISA đang chạy")
})

// 👉 start
const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
