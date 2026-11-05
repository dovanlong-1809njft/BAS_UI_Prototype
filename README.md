# BAS — Berthing Aid System

**BAS UI Prototype** là giao diện mô phỏng hỗ trợ tàu cập cầu, cho phép quan sát tàu trong môi trường 3D và theo dõi các thông số tiếp cận theo chuyển động.

## Công nghệ sử dụng

React · Vite · Three.js · React Three Fiber · Drei

## Chức năng đã triển khai

- Môi trường 3D gồm cầu cảng, mặt nước có hiệu ứng gợn sóng và hai mô hình tàu GLB.
- Chọn tàu du lịch hoặc tàu chở dầu.
- Điều khiển tàu tiến/lùi, dịch ngang và xoay, hỗ trợ chế độ điều khiển tinh.
- Bốn góc camera, hỗ trợ xoay 360°, thu phóng và di chuyển góc nhìn.
- Hiển thị khoảng cách mũi/đuôi, tốc độ tiếp cận, góc cập cầu và hướng mũi tàu.
- Cảnh báo theo ngưỡng mô phỏng và ghi nhận sự kiện.
- Biểu đồ lịch sử khoảng cách trong cửa sổ 60 giây.
- Phát hiện tiếp xúc và ngăn tàu xuyên vào cầu cảng.

Các thông số được tính từ trạng thái mô phỏng 3D nội bộ, không phải dữ liệu cảm biến thực.

## Cài đặt và chạy

Yêu cầu: Node.js và npm.

```bash
npm install
npm run dev
```

Mở địa chỉ do Vite cung cấp, thường là `http://localhost:5173`.

## Điều khiển

| Phím | Chức năng |
|---|---|
| W / S | Tiến / Lùi |
| A / D | Dịch trái / phải |
| Q / E | Xoay tàu |
| Shift | Điều khiển tinh |

Nhấp vào vùng 3D để sử dụng bàn phím. Có thể chọn camera, đổi loại tàu và đặt lại vị trí ngay trên giao diện.

## Cấu trúc mã nguồn

```text
src/
├── components/
│   ├── ShipScene.jsx       # Cảnh 3D, tàu và camera
│   └── TelemetryPanel.jsx  # Thông số và cảnh báo
├── simulation/
│   └── state.js            # Trạng thái và logic mô phỏng
├── assets/models/          # Hai mô hình tàu GLB
├── App.jsx                 # Dashboard chính
├── main.jsx                # Điểm khởi chạy React
└── styles.css              # Giao diện CSS
```

## Giới hạn

- Frontend-only, chưa kết nối backend, MQTT hoặc cảm biến thực.
- Chuyển động tàu được điều khiển trực tiếp, chưa mô phỏng đầy đủ quán tính, gió và dòng chảy.
- Kích thước tàu, khoảng cách và ngưỡng cảnh báo mang tính minh họa.
- Cần xác minh quyền phân phối các mô hình GLB trước khi công khai asset.

**BAS hiện là prototype phục vụ trình diễn và kiểm thử giao diện, không dùng cho điều động tàu thực tế.**