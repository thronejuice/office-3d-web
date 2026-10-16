# คู่มือสำหรับฝ่าย IT: ติดตั้ง Office3D และใบรับรอง HTTPS

เบราว์เซอร์อนุญาตให้ใช้ไมโครโฟนเฉพาะบนเว็บ **HTTPS** เท่านั้น แต่บริษัทไม่มีโดเมนสาธารณะ ระบบจึงใช้ใบรับรองที่ออกโดย CA ภายใน (Caddy) ทุกเครื่องต้อง **เชื่อถือ CA นี้หนึ่งครั้ง** จากนั้นจะเปิดได้โดยไม่มีคำเตือน

> ไฟล์ CA ดาวน์โหลดได้ที่ **`http://<OFFICE_HOST>/ca.crt`** (ใช้ http ได้ เพราะเป็นไฟล์สาธารณะภายใน ไม่ใช่ความลับ) เช่น `http://office.local/ca.crt`
> อย่าส่ง/เผยแพร่ไฟล์ `root.key` (อยู่ใน volume `caddy-data` และไม่เคยถูกเปิดให้ดาวน์โหลด)

## 0. เตรียมเซิร์ฟเวอร์

1. กำหนด IP ถาวรให้เซิร์ฟเวอร์ เช่น `10.0.0.5`
2. คัดลอก `.env.example` เป็น `.env` แล้วตั้งค่า `OFFICE_HOST` (ชื่อหรือ IP ที่พนักงานพิมพ์) และ `LAN_IP` (IP ของเซิร์ฟเวอร์), `POSTGRES_PASSWORD`, `INITIAL_ADMIN_PASSWORD`, `TURN_SECRET`
3. `docker compose up -d --build`
4. เปิดไฟร์วอลล์เฉพาะเครือข่ายภายใน/VPN: `80/tcp`, `443/tcp`, `3478/tcp+udp`, `49160-49200/udp` — **ห้ามเปิดสู่อินเทอร์เน็ต**

## 1. ให้เครื่องเรียกชื่อเซิร์ฟเวอร์ได้

ถ้าตั้ง `OFFICE_HOST` เป็น **IP** (เช่น `10.0.0.5`) ข้ามขั้นตอนนี้ได้

ถ้าใช้ชื่อ (เช่น `office.local`) ให้เลือกอย่างใดอย่างหนึ่ง:

* **DNS ภายในบริษัท (แนะนำ):** เพิ่ม A record `office.local → 10.0.0.5` ใน DNS/DHCP ของบริษัท
* **ไฟล์ hosts เป็นรายเครื่อง:** เพิ่มบรรทัด `10.0.0.5  office.local`
  * Windows: เปิด Notepad แบบ Run as administrator → เปิด `C:\Windows\System32\drivers\etc\hosts`
  * macOS/Linux: `sudo nano /etc/hosts`
  * มือถือ iOS/Android แก้ hosts ไม่ได้ → ใช้ DNS ภายใน หรือใช้ IP เป็น `OFFICE_HOST` แทน

## 2. ติดตั้งใบรับรอง

ดาวน์โหลด `http://<OFFICE_HOST>/ca.crt` ลงเครื่องก่อน แล้วทำตามระบบปฏิบัติการ

### Windows (Chrome / Edge)

1. ดับเบิลคลิก `office3d-root-ca.crt` → **Install Certificate…**
2. เลือก **Local Machine** (ต้องมีสิทธิ์ผู้ดูแล) → Next
3. เลือก **Place all certificates in the following store** → Browse → **Trusted Root Certification Authorities** → OK → Next → Finish
4. ปิดแล้วเปิดเบราว์เซอร์ใหม่ทั้งหมด

(ติดตั้งทั้งบริษัทพร้อมกัน: แจกผ่าน Group Policy → *Computer Configuration › Windows Settings › Security Settings › Public Key Policies › Trusted Root Certification Authorities*)

### macOS (Safari / Chrome)

1. ดับเบิลคลิกไฟล์ → เปิด **Keychain Access** → เลือก keychain **System**
2. ดับเบิลคลิกใบรับรอง **Caddy Local Authority** → ขยาย **Trust** → *When using this certificate* เลือก **Always Trust** → ปิดหน้าต่างและใส่รหัสผ่านเครื่อง

### Android (Chrome)

1. เปิดไฟล์ที่ดาวน์โหลด หรือไปที่ **การตั้งค่า › ความปลอดภัย (Security) › การเข้ารหัสและข้อมูลรับรอง (Encryption & credentials) › ติดตั้งใบรับรอง (Install a certificate) › ใบรับรอง CA (CA certificate)**
2. กด **Install anyway** → เลือกไฟล์ `office3d-root-ca.crt` (ต้องตั้งรหัสล็อกหน้าจอไว้ก่อน)
3. ชื่อเมนูต่างกันเล็กน้อยตามยี่ห้อ ให้ค้นคำว่า "certificate" ในการตั้งค่า

### iOS / iPadOS (Safari) — ต้องทำ **สองขั้น**

1. เปิด `http://<OFFICE_HOST>/ca.crt` ใน **Safari** → กด **อนุญาต (Allow)** เมื่อถามว่าจะดาวน์โหลดโปรไฟล์
2. ไปที่ **การตั้งค่า › ทั่วไป › VPN และการจัดการอุปกรณ์** (Settings › General › VPN & Device Management) → เลือกโปรไฟล์ **Caddy Local Authority** → **ติดตั้ง (Install)** → ใส่รหัสผ่านเครื่อง → ติดตั้ง
3. **ขั้นที่สองที่คนมักลืม:** ไปที่ **การตั้งค่า › ทั่วไป › เกี่ยวกับ › การตั้งค่าความน่าเชื่อถือของใบรับรอง** (Settings › General › About › Certificate Trust Settings) → เปิดสวิตช์ **Caddy Local Authority** ให้ "เชื่อถือเต็มรูปแบบ" → ยืนยัน **ดำเนินการต่อ**
4. ปิด Safari แล้วเปิด `https://<OFFICE_HOST>` ใหม่

### Firefox (ทุกระบบ)

Firefox ใช้คลังใบรับรองของตัวเอง เลือกอย่างใดอย่างหนึ่ง:

* **การตั้งค่า › ความเป็นส่วนตัวและความปลอดภัย › ใบรับรอง › ดูใบรับรอง › Authorities › Import…** เลือกไฟล์ แล้วติ๊ก *Trust this CA to identify websites*
* หรือเปิด `about:config` ตั้ง `security.enterprise_roots.enabled` = `true` (ใช้คลังของระบบปฏิบัติการ)

## 3. ตรวจสอบ

เปิด `https://<OFFICE_HOST>` — ต้องเห็นรูปกุญแจโดยไม่มีคำเตือน ล็อกอินแล้วกด **เข้าออฟฟิศ** เบราว์เซอร์จะขอสิทธิ์ไมโครโฟน ให้กด **อนุญาต**

## 4. ใช้ใบรับรองจริงแทน (ถ้าภายหลังมี)

1. วางไฟล์ใน `./certs/` เช่น `office.crt` (รวมสายใบรับรองเต็ม) และ `office.key`
2. ใน `.env` ตั้ง `TLS_CERT_FILE=/certs/office.crt` และ `TLS_KEY_FILE=/certs/office.key`
3. `docker compose up -d caddy` — ไม่ต้องติดตั้ง CA บนเครื่องผู้ใช้อีก

กลับไปใช้ CA ภายในโดยเว้นสองตัวแปรนี้ให้ว่าง

## 5. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| เบราว์เซอร์เตือน "การเชื่อมต่อไม่เป็นส่วนตัว" | ยังไม่ได้ติดตั้ง/เชื่อถือ CA บนเครื่องนั้น (iOS: ลืมขั้น Certificate Trust Settings) |
| เข้าได้แต่ไม่มีเสียง / บอกว่าไม่ได้รับอนุญาตใช้ไมค์ | กดไอคอนกุญแจข้างช่องที่อยู่ → อนุญาตไมโครโฟน → โหลดหน้าใหม่ |
| ได้ยินเฉพาะบางคน | ดูกติกาเสียง: ได้ยินเฉพาะคนในระยะ 6 ช่อง หรือคนในห้องประชุมเดียวกัน; สถานะ "ห้ามรบกวน" ปิดเสียงทั้งสองทาง |
| เชื่อมต่อเสียงไม่ติดเมื่อใช้ VPN | ตรวจว่าเปิดพอร์ต `3478` และ `49160-49200/udp` บนเซิร์ฟเวอร์ และ `LAN_IP` ใน `.env` ตรงกับ IP ที่ VPN เข้าถึงได้ |
| เปลี่ยน IP เซิร์ฟเวอร์ | แก้ `OFFICE_HOST`, `LAN_IP` แล้ว `docker compose up -d` (ถ้าใช้ CA ภายใน ใบรับรองจะออกใหม่ภายใต้ CA เดิม ไม่ต้องติดตั้งซ้ำ) |
