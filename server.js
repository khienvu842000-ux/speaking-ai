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

    if (!video_url) {
      return res.status(400).json({ error: "Thiếu video_url" })
    }

    const videoRes = await axios.get(video_url, {
      responseType: "arraybuffer",
      timeout: 30000
    })

    const buffer = Buffer.from(videoRes.data)

    // ❗ chặn video quá lớn
    if (buffer.length > 30 * 1024 * 1024) {
      return res.json({
        feedback: "❌ Video quá dài (tối đa ~3 phút)"
      })
    }

    // ==============================
    // 🔥 CHIA CHUNK
    // ==============================
    const chunkSize = 5 * 1024 * 1024
    let fullTranscript = ""

    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize)

      const formData = new FormData()
      formData.append("file", chunk, { filename: "audio.mp4" })
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
    }

    if (!fullTranscript) {
      return res.json({ feedback: "❌ Không nghe rõ nội dung" })
    }

    console.log("📝 TEXT:", fullTranscript)

    // ==============================
    // 🤖 AI CHẤM (NÂNG CẤP CHUẨN GIÁO VIÊN)
    // ==============================
    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `
Bạn là giáo viên tiếng Anh tiểu học tại trung tâm KAISA.

Nguyên tắc:
- Nhận xét như giáo viên thật
- Ngắn gọn, dễ hiểu
- Không dùng từ khó
- Luôn tích cực
- Chỉ sửa lỗi quan trọng nhất
- Không đoán phát âm nếu không chắc
- Tổng nội dung dưới 120 từ

Thang điểm:
0-4: yếu
5-6: trung bình
7-8: khá
9-10: tốt
`
        },
        {
          role: "user",
          content: `
Bài nói của học sinh:
"${fullTranscript}"

Hãy chấm theo format:

🎯 CHẤM ĐIỂM:
- Phát âm: x/10 (độ rõ)
- Trôi chảy: x/10 (ngập ngừng hay không)
- Ngữ pháp: x/10 (đúng cấu trúc)
- Từ vựng: x/10 (đa dạng hay lặp)

👉 Tổng điểm: x/10

📌 NHẬN XÉT:
(1 câu khen + 1 câu góp ý)

🔊 PHÁT ÂM:
- nếu có lỗi: chỉ ra 1 lỗi rõ nhất
- nếu không chắc: "Phát âm khá rõ"

📌 NGỮ PHÁP:
- chỉ ra lỗi quan trọng nhất

❌ LỖI TRỌNG TÂM:
- 1 câu sai → sửa lại đúng

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
      analysis.choices?.[0]?.message?.content || "Không có kết quả"

    // ❗ tránh lỗi Zalo
    if (feedback.length > 1200) {
      feedback = feedback.slice(0, 1200)
    }

    console.log("📊 FEEDBACK:", feedback)

    return res.json({
      transcript: fullTranscript,
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

app.listen(process.env.PORT || 8080, () => {
  console.log("🚀 Railway running")
})
