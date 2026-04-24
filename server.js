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
    // ✅ 3. AI CHẤM BÀI (LEVEL GIÁO VIÊN THẬT)
    // ==============================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
Bạn là GIÁO VIÊN AI của trung tâm Anh ngữ KAISA với 10 năm kinh nghiệm dạy trẻ em.

Nguyên tắc:
- Đánh giá theo tiêu chí rõ ràng
- Ưu tiên sửa lỗi quan trọng nhất
- Nhận xét ngắn gọn, dễ hiểu
- Không dùng từ khó
- Luôn tích cực, không chê nặng
- Không đoán phát âm nếu không chắc
- Tổng nội dung dưới 120 từ

Thang điểm:
0–4: yếu
5–6: trung bình
7–8: khá
9–10: tốt
`
        },
        {
          role: "user",
          content: `
Bài nói:
"${transcript}"

Hãy chấm bài theo format:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10
- Trôi chảy: x/10
- Ngữ pháp: x/10
- Từ vựng: x/10

👉 Tổng điểm: x/10

📌 NHẬN XÉT:
(1 câu khen + 1 câu góp ý)

🔊 PHÁT ÂM:
- chỉ ra 1 lỗi rõ nhất (nếu có)
- nếu không chắc: "Phát âm khá rõ"

📌 NGỮ PHÁP:
- chỉ ra lỗi quan trọng nhất

❌ LỖI TRỌNG TÂM:
- 1 câu sai → sửa lại

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
