# Prompt: รัน Office3D

คัดลอกข้อความด้านล่างไปวางให้ Claude Code (เปิดที่โฟลเดอร์โปรเจกต์)

---

ช่วยรันโปรเจกต์ Office3D (ออฟฟิศ 3 มิติ + เสียงตามระยะ) ให้ใช้งานได้ แล้วรายงานผลเป็นภาษาไทย

## สิ่งที่โปรเจกต์ต้องใช้
- Node 22+, pnpm 12 (`pnpm install` ที่ root), Docker + Compose v2
- ไฟล์ `.env` (ดูตัวอย่างใน `.env.example`): `OFFICE_HOST`, `LAN_IP`, `POSTGRES_PASSWORD`, `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, `TURN_SECRET`, (ไม่บังคับ) `TLS_CERT_FILE`/`TLS_KEY_FILE`
- Services: caddy (HTTPS ด้วย internal CA), web, server (Fastify + Socket.IO), postgres, coturn
- ไมค์ใช้ได้เฉพาะ HTTPS หรือ `localhost` เท่านั้น
- ห้ามโหลดอะไรจากอินเทอร์เน็ตตอนรัน และห้ามเปิดพอร์ตออกสู่ภายนอก (ใช้ LAN/VPN เท่านั้น)

## ให้ทำตามลำดับ
1. ตรวจ `.env` ว่ามีครบทุกตัวแปร ถ้าค่ายังเป็น `change-me-*` ให้บอกฉัน อย่าแก้รหัสผ่านเอง
2. เลือกโหมดตามที่ฉันบอก (ถ้าไม่บอก ใช้โหมด A):
   - **A. Production (Docker):** `docker compose up -d --build` แล้วเช็ก `docker compose ps` ว่าทุก service healthy และเปิด `https://<OFFICE_HOST>` ได้
   - **B. Dev:** `pnpm install` → `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres` → รัน `pnpm dev:server` (ตั้ง `DATABASE_URL`, `INITIAL_ADMIN_PASSWORD`) → `pnpm dev:web` ที่ http://localhost:5173
3. ตรวจ health endpoint ของ server และดู `docker compose logs server` ว่าไม่มี error / migration รันผ่าน
4. ล็อกอินด้วยแอดมินเริ่มต้นได้ และระบบบังคับเปลี่ยนรหัสผ่านครั้งแรก (บัญชีทดสอบดูที่ `TEST-USERS.md`)
5. รันเช็ก: `pnpm typecheck`, `pnpm test`, และ `pnpm e2e` (ครั้งแรกต้อง `cd e2e && npx playwright install chromium`; e2e ต้องรัน stack อยู่ และตั้ง `BASE_URL=https://localhost` ถ้าใช้ compose)

## กติกา
- ถ้าขั้นไหนพัง ให้แสดง error จริง วิเคราะห์สาเหตุ แล้วแก้ที่ต้นเหตุ อย่าข้ามหรือปิด test
- ห้าม commit/เผย secret จาก `.env`
- ถ้าต้องติดตั้ง CA บนอุปกรณ์ ชี้ไปที่ `docs/IT-GUIDE.th.md` (โหลด CA ที่ `http://<OFFICE_HOST>/ca.crt`)
- เมื่อเสร็จ สรุป: URL ที่เปิดได้, สถานะแต่ละ service, ผล test, และสิ่งที่ยังไม่ได้ตรวจ (เช่น ทดสอบมือถือ/iPhone จริง)

## พอร์ตที่ต้องเปิดใน firewall (LAN/VPN เท่านั้น)
80/tcp, 443/tcp, 3478/udp+tcp, 49160-49200/udp
