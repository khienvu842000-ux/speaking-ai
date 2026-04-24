import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"

const app = express()
app.use(express.json())

process.on("uncaughtException", err => console.error("🔥 UNCAUGHT:", err))
process.on("unhandledRejection", err => console.error("🔥 PROMISE ERROR:", err))

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// 👉 delay tránh spam API
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
    console.log("📦 SIZE:", buffer.length)

    // ==============================
    // ✅ 2. XỬ LÝ NGẮN / DÀI
    // ==============================
    let fullTranscript = ""

    const MAX_DIRECT_SIZE = 6 * 1024 * 1024 // ~6MB

    // 👉 VIDEO NGẮN
    if (buffer.length <= MAX_DIRECT_SIZE) {
      console.log("⚡ VIDEO NGẮN")

      const formData = new FormData()
      formData.append("file", buffer, { filename: "audio.mp4" })
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

      fullTranscript = transcriptRes.data.text || ""

    } else {
      // 👉 VIDEO DÀI (CHIA CHUNK)
      console.log("🐢 VIDEO DÀI → chia nhỏ")

      const chunkSize = 4 * 1024 * 1024
      const chunks = []

      for (let i = 0; i < buffer.length; i += chunkSize) {
        chunks.push(buffer.slice(i, i + chunkSize))
      }

      console.log("📦 TOTAL CHUNKS:", chunks.length)

      for (let i = 0; i < chunks.length; i++) {
        console.log(`🎙️ CHUNK ${i + 1}`)

        const formData = new FormData()
        formData.append("file", chunks[i], {
          filename: `audio_${i}.mp4`
        })
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

        await sleep(400)
      }
    }

    console.log("📝 FULL TEXT:", fullTranscript)

    if (!fullTranscript) {
      return res.json({
        feedback: "❌ Không nghe rõ nội dung"
      })
    }

    // ==============================
    // ✅ 3. AI CHẤM BÀI NÂNG CẤP
    // ==============================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên tiếng Anh tiểu học (6-12 tuổi).

Quy tắc:
- Nhận xét ngắn gọn, dễ hiểu
- Luôn tích cực, động viên
- Không dùng từ khó
- Không đoán phát âm nếu không chắc
- Tối đa 120 từ
`
        },
        {
          role: "user",
          content: `
Bài nói:
"${fullTranscript}"

Hãy đánh giá theo format:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10
- Trôi chảy: x/10
- Ngữ pháp: x/10
- Từ vựng: x/10

👉 Tổng điểm: x/10

📌 NHẬN XÉT:
(2 câu ngắn)

🔊 PHÁT ÂM:
- chỉ 1 lỗi rõ nhất (nếu có)
- ví dụ /θ/, /ʃ/
- nếu không chắc → "Phát âm khá rõ"

📌 NGỮ PHÁP:
- chỉ ra 1 lỗi chính (thiếu chủ ngữ / sai thì)

❌ LỖI SAI:
- câu sai → sửa lại

💡 GỢI Ý:
- 1 câu tốt hơn

⭐ ĐÁNH GIÁ:
- ⭐ 1–5

👉 kết thúc bằng lời khen
`
        }
      ]
    })

    let feedback =
      analysis.choices?.[0]?.message?.content || "Không có phản hồi"

    if (feedback.length > 1200) {
      feedback = feedback.slice(0, 1200)
    }

    console.log("📊 FEEDBACK:", feedback)

    // ==============================
    // ✅ 4. TRẢ KẾT QUẢ
    // ==============================
    return res.json({
      transcript: fullTranscript,
      feedback
    })

  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message)

    return res.status(500).json({
      error: "Lỗi xử lý video"
    })
  }
})

app.get("/", (req, res) => {
  res.send("🚀 Speaking AI API đang chạy")
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
