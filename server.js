import express from "express"
import axios from "axios"
import OpenAI from "openai"
import FormData from "form-data"

const app = express()
app.use(express.json())

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

// 👉 API chính
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
      timeout: 15000
    })

    const buffer = Buffer.from(videoRes.data)

    console.log("✅ Download OK:", buffer.length)

    // ==============================
    // ✅ 2. TRANSCRIBE (speech → text)
    // ==============================
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
    // ✅ 3. AI CHẤM BÀI (BẢN CHUẨN KAISA)
    // ==============================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên tiếng Anh cho học sinh tiểu học (6-12 tuổi).

Quy tắc:
- Ngôn ngữ đơn giản, dễ hiểu
- Luôn tích cực, động viên
- Không chê nặng
- Giải thích ngắn gọn
- Tổng phản hồi dưới 120 từ
`
        },
        {
          role: "user",
          content: `
Bài nói của học sinh:
"${transcript}"

Hãy đánh giá theo format CHÍNH XÁC:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10
- Trôi chảy: x/10
- Ngữ pháp: x/10
- Từ vựng: x/10

👉 Tổng điểm: x/10

📌 NHẬN XÉT:
(2-3 câu đơn giản, thân thiện)

❌ LỖI SAI:
- viết lại câu sai
- sửa lại câu đúng
- giải thích 1 câu

💡 GỢI Ý:
- đưa ra 1-2 câu nói tốt hơn

⭐ ĐÁNH GIÁ:
- dùng sao (⭐ 1-5)

👉 Kết thúc bằng lời khen
`
        }
      ]
    })

    let feedback =
      analysis.choices?.[0]?.message?.content || "Không có phản hồi"

    // 👉 tránh lỗi Zalo do quá dài
    if (feedback.length > 1200) {
      feedback = feedback.slice(0, 1200)
    }

    console.log("📊 FEEDBACK:", feedback)

    // ==============================
    // ✅ 4. TRẢ KẾT QUẢ
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

// 👉 test nhanh
app.get("/", (req, res) => {
  res.send("🚀 Speaking AI API đang chạy")
})

// 👉 start server
const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log("🚀 Server chạy ở port", PORT)
})
