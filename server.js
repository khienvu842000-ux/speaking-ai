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
    // ✅ 3. AI CHẤM BÀI (KAISA AI TEACHER)
    // ==============================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `
Bạn là GIÁO VIÊN AI của trung tâm Anh ngữ KAISA.

Nhiệm vụ:
- Chấm bài nói tiếng Anh cho học sinh tiểu học
- Nhận xét dễ hiểu, thân thiện
- Không dùng từ khó
- Luôn động viên học sinh
- Không đoán phát âm nếu không chắc
- Tổng nội dung dưới 130 từ
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
(2 câu ngắn, tích cực, dễ hiểu)

🔊 PHÁT ÂM:
- nếu có lỗi: chỉ ra tối đa 2 từ sai
- hướng dẫn cách đọc đơn giản (ví dụ /θ/, /ʃ/)
- nếu không rõ: "Phát âm khá rõ"

📌 NGỮ PHÁP:
- chỉ ra 1 lỗi quan trọng nhất (thiếu chủ ngữ / sai thì)

❌ LỖI SAI:
- câu sai → sửa lại câu đúng

📈 CẦN CẢI THIỆN:
- nói rõ học sinh cần cải thiện gì từ bài nói

💡 GỢI Ý LUYỆN TẬP:
- đưa 1 cách luyện cụ thể

💡 CÂU MẪU:
- 1 câu nói tốt hơn học sinh có thể dùng

⭐ ĐÁNH GIÁ:
- ⭐ 1–5

👉 Kết thúc bằng:
"Giáo viên AI KAISA luôn đồng hành cùng con 💙"
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
