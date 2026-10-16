# Impeccable Audit: apps/web (UI)

อัปเดตล่าสุด: รอบ audit ที่ 3 · คะแนนประมาณ **17/20 (Good)** · ตรวจจากโค้ด + Playwright (Chromium) · detector: ไม่มี error เหลือ advisory 14 รายการ

| # | หัวข้อ | คะแนน | จุดสำคัญ |
|---|---|---|---|
| 1 | Accessibility | 4 | modal/เมนู/ตาราง/ปุ่มไอคอนใช้คีย์บอร์ดและ screen reader ได้ (ยังไม่ทดสอบ screen reader จริง) |
| 2 | Performance | 3 | bundle หลัก 1.33 MB (gzip 375 KB) |
| 3 | Theming | 4 | token ครบ มี dark mode |
| 4 | Responsive | 3 | แก้ด้วยการสัมผัสยังไม่ได้ทดสอบจริง |
| 5 | Integrity | 3 | advisory 14 รายการ (font-size/radius นอก DESIGN.md) |

ผลทดสอบล่าสุด: typecheck ผ่าน · test ผ่าน (shared 17, server 6) · build ผ่าน · e2e 8/8 (กับ stack ที่ rebuild ใหม่)

---

## แก้แล้ว

### รอบ 1–2
- [x] เอา `user-scalable=no` ออก
- [x] modal ใน Hud: `role="dialog"`, focus trap, Esc, คืนโฟกัส · เมนู ☰ `aria-expanded` + Esc
- [x] รายชื่อออนไลน์เป็นปุ่ม · สถานะไม่ใช้สีอย่างเดียว (รูปทรง + `role="img"` + ป้ายกำกับ)
- [x] `aria-label` ปุ่มไอคอน · `aria-live` toast · `role="alert"` banner
- [x] ปุ่ม ≥ 44px · คอนทราสต์ (muted 5.5:1, danger 5.1:1, warn 5.8:1)
- [x] Hud ใช้ selector · token สี + dark mode (รวม `.preview`, `.joystick`) · drawer เป็น bottom sheet ไม่ทับ joystick

### รอบ 3
- [x] **Modal ใช้ร่วมกัน** — `src/ui/Modal.tsx` (แก้บั๊กโฟกัสกระโดดทุกครั้งที่พิมพ์) ใช้ใน Hud และ Admin · ทดสอบ: Tab วนในกล่อง, Esc ปิด, โฟกัสกลับที่ปุ่มเปิด
- [x] **Admin:** ปุ่มในตารางมีชื่อผู้ใช้ใน `aria-label` · `role="alert"` ที่ข้อความผิดพลาด
- [x] **MapEditor:** `touch-action: none` ที่ canvas + เคลียร์สถานะวาดเมื่อ `pointercancel` · ✕ ลบโซน และ ↩ ย้อนเวอร์ชันมี `aria-label` · หัวข้อเวอร์ชันเป็นปุ่ม `aria-expanded` · ข้อความไทยย้ายเข้า `strings.th.ts`
- [x] **Lobby ใหม่** — ฉากหลังแผนที่ (เรนเดอร์ครั้งเดียว), สถานะไมค์ก่อนเข้า 5 แบบ, ลำดับหน้าชัด, วงโฟกัสสีน้ำเงิน · เพิ่ม `GET /api/map` (อ่านอย่างเดียว ต้องล็อกอิน)
- [x] แก้เทสต์ e2e ให้หาเมนูเป็น `menuitem`

---

## ยังเหลือ

### P3
- [ ] **Advisory 14 รายการ** — ค่านอก DESIGN.md ใน `src/styles.css`: radius 12/16/2/1px, font-size .9rem/1.2rem/20px → ปรับค่าหรือเพิ่มขั้นใน DESIGN.md · `/impeccable extract`
- [ ] **Bundle หลักใหญ่** — แยก chunk three.js/ออฟฟิศออกจากหน้า login · `/impeccable optimize`
- [ ] **อีโมจิเป็นไอคอน** — 🔇 🎤 👋 👏 👍 ✋ 👥 แสดงผลต่างกันตาม OS (Lobby ใช้ SVG แล้ว) → เปลี่ยนเป็น SVG ชุดเดียว

### ยังไม่ได้ทดสอบ
- [ ] แก้แผนที่ด้วยการสัมผัสจริง (มือถือ/แท็บเล็ต) และ iPhone/Safari (Lobby WebGL + ไมค์)
- [ ] screen reader จริง · สถานะไมค์ "ถูกบล็อก/ไม่มีไมค์/พร้อม" ใน Lobby ด้วยตา · ข้อความยาวบนจอ 320px
- [ ] fps ตามงบ §5
- [ ] เทสต์อัตโนมัติของ Lobby (`GET /api/map` 401/200, กดเข้าออฟฟิศ) และของ Modal
- [ ] `Scene.tsx`, `Avatar.tsx` (โค้ด 3D) ยังไม่ได้ audit

---

## สิ่งที่ดีอยู่แล้ว (รักษาไว้)
- ฟอนต์ไทยฝังในแอป ไม่โหลดจากเน็ต
- Joystick: pointer capture + `touch-action: none` + `pointercancel`
- รองรับ `safe-area-inset` · ฟอร์มมี `label` + `autoComplete`
- ข้อความไทยรวมที่ `strings.th.ts`
- มี PRODUCT.md และ DESIGN.md (`apps/web/`) เป็นเกณฑ์ตรวจ

## คำสั่งที่เหลือ
1. `/impeccable extract` — advisory 14 รายการ
2. `/impeccable optimize` — แยก chunk
3. `/impeccable polish` — รอบสุดท้าย

ตรวจซ้ำหลังแก้: `/impeccable audit`


---

## Audit: game screens (โป๊กเกอร์ / หมากรุก / ยูโน / ป๊อกเด้ง / บิงโก / ฟังเพลง)

ตรวจจากโค้ด + คำนวณคอนทราสต์ + Playwright (Chromium) · detector: advisory เท่านั้น (สีเกม/ขนาดตัวอักษรนอก DESIGN.md ซึ่งเป็นสีของวัตถุจริง เช่น สักหลาด กระดาน ไพ่ จึงบันทึกเป็นหัวข้อ "Game Surfaces" ใน `apps/web/DESIGN.md` แทนการเปลี่ยนค่า)

### แก้แล้ว
- [x] **กระดานหมากรุกเดิมมี 64 tab stop** (ปุ่มทุกช่อง) → เป็น tab stop เดียว เลื่อนด้วยลูกศร/Home/End (roving tabindex), Enter เลือกและเดิน, ช่องที่เดินไปได้ประกาศว่า "เดินไปได้", ราชาที่ถูกรุกมีข้อความ "ถูกรุก!" ทั้งที่หัวแผงและป้ายช่อง (ไม่พึ่งสีแดงอย่างเดียว) · มีเทสต์ e2e
- [x] **ช่องหมากรุกเมื่อไม่ถึงตา** ใช้ `aria-disabled` แทน `disabled` เพื่อให้ผู้ใช้คีย์บอร์ด/screen reader ดูกระดานได้
- [x] **Esc ปิดแผงเกม** (ที่นั่งยังอยู่ เปิดใหม่ได้จากปุ่มโต๊ะ)
- [x] **คอนทราสต์ไพ่ Uno**: เหลืองเดิม 2.95:1 → ตัวเลขสีเข้มบนเหลือง `#f2b01e`; แดง/เขียวปรับเป็น `#c9354e`/`#1f7d4e` (≥ 4.5:1) ทุกสีมีรูปทรงประจำสี
- [x] **ตารางเลขบิงโกเล็กเกินไป** (.62rem) → .72rem
- [x] **ช่องหมากรุกบนมือถือ** ≈ 42px → ลด padding แผงให้ ≈ 44px
- [x] ปุ่ม/เป้าสัมผัส ≥ 44px, สถานะไม่ใช้สีอย่างเดียว (เส้นรอบ + `aria-current` ตาเดิน, `+`/`−` ที่เงิน, เครื่องหมายถูกที่ช่องบิงโก), `prefers-reduced-motion` ถูกเคารพ (ไพ่ Uno, ช่องบิงโกที่กะพริบ)
- [x] คอนทราสต์: กำไรสีเขียว 5.4:1 (มืด 8.7:1), ข้อความบนสักหลาด 5.0–6.4:1, หัวคอลัมน์บิงโก 4.5:1

### ยังเหลือ / ข้อจำกัด
- [ ] ยังไม่ได้ทดสอบด้วย screen reader จริงและบนมือถือ/iPhone จริง
- [ ] แผงเกมบนมือถือกินพื้นที่ล่างของจอ (ปิดได้ด้วย ✕ หรือ Esc)
- [ ] ตัวหมากรุกบางตัว (ม้า) วาดแบบเรียบง่าย
- [x] error boundary: แผงเกมพังเฉพาะแผงถูกแทนด้วยข้อความและปุ่มปิด (ออฟฟิศยังทำงาน), ส่วนอื่นพังจะขึ้นหน้า "หน้าเว็บขัดข้อง" พร้อมปุ่มโหลดใหม่ · มีเทสต์ e2e
