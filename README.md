# ZetaFi

**ZetaFi** adalah aplikasi kasir & manajemen stok untuk UMKM (warung, toko kelontong, pedagang kaki lima) yang membantu penjual menghitung penjualan, memantau stok barang, dan mengetahui keuntungan secara otomatis — tanpa perlu pembukuan manual.

Setiap transaksi yang dikonfirmasi juga dicatat secara permanen di blockchain Stellar sebagai *audit trail* yang tidak bisa dimanipulasi, sehingga riwayat omzet warung dapat diverifikasi kapan pun — baik untuk keperluan evaluasi bisnis, pelaporan pajak, maupun pengajuan akses pembiayaan di masa depan.

> Dokumen ini ditulis agar dapat dipahami oleh AI coding agent (Claude Code, Cursor, dsb.) maupun developer manusia sebagai peta arsitektur sistem sebelum mulai membaca/menulis kode.

---

## 1. Konsep Produk

### 1.1 Masalah yang Diselesaikan

Pemilik warung umumnya mencatat penjualan secara manual — di buku tulis atau bahkan hanya hafalan. Akibatnya:
- Keuntungan bersih sulit diketahui karena modal dan harga jual tidak terdokumentasi dengan jelas.
- Stok barang tidak terpantau, sehingga warung bisa kehabisan barang tanpa tahu kapan dan berapa yang terjual.
- Tidak ada riwayat omzet yang kredibel dan bisa diverifikasi oleh pihak ketiga (misalnya lembaga pembiayaan).

### 1.2 Solusi — Fitur Utama Aplikasi

**Fitur 1 — Manajemen Produk & Kalkulasi Keuntungan**

Penjual memasukkan data produk: harga beli (modal), jumlah unit yang dibeli, dan harga jual per satuan. Sistem secara otomatis menghitung:
- Harga satuan modal (total modal ÷ jumlah unit).
- Keuntungan per unit (harga jual − harga satuan modal).
- Proyeksi keuntungan total jika seluruh stok habis terjual.

Ini membantu penjual menentukan harga jual yang tepat dan mengetahui margin keuntungan mereka sebelum berjualan.

**Fitur 2 — Kasir & Pengurangan Stok Otomatis**

Saat ada pembeli, penjual memilih produk yang dibeli beserta jumlahnya langsung dari aplikasi. Sistem otomatis:
- Menghitung total harga transaksi.
- Mengurangi stok barang sesuai jumlah yang terjual.
- Menampilkan sisa stok terkini setelah transaksi selesai.

**Fitur 3 — Konfirmasi Pembayaran QRIS (Otomatis)**

Jika pembeli membayar via QRIS, backend menerima notifikasi dari payment gateway secara real-time. Transaksi langsung dikonfirmasi dan dicatat tanpa penjual perlu melakukan apapun secara manual.

**Fitur 4 — Konfirmasi Pembayaran Manual (Cash / Metode Lain)**

Jika pembeli membayar tunai atau metode lain yang tidak terhubung ke sistem, penjual menekan tombol konfirmasi secara manual. Transaksi tetap tercatat dengan lengkap di sistem.

**Fitur 5 — Audit Trail On-Chain (Blockchain)**

Setiap transaksi yang berhasil dikonfirmasi (baik via QRIS maupun manual) ditulis ke **smart contract Soroban** di Stellar Network sebagai entri *append-only* yang tidak bisa diubah atau dihapus. Yang tersimpan on-chain hanya: nominal transaksi, timestamp, dan hash referensi — bukan detail sensitif seperti nama pembeli atau rincian item.

Manfaat audit trail on-chain:
- **Verifikasi omzet independen**: siapapun dengan akses ke contract address dapat memverifikasi total penjualan warung tanpa perlu mempercayai database backend.
- **Bukti omzet untuk pembiayaan**: riwayat on-chain yang immutable bisa menjadi input credit scoring di masa depan tanpa proses audit manual.
- **Transparansi bisnis**: penjual punya bukti permanen bahwa catatan penjualan mereka akurat dan tidak dimanipulasi.

### 1.3 Prinsip Desain Penting

- **Semua tetap dalam Rupiah**: penjual dan pembeli tidak pernah berinteraksi dengan kripto, wallet, atau seed phrase. Seluruh UX berbasis IDR.
- **On-chain = audit trail, bukan compute utama**: logika bisnis (hitung stok, kalkulasi keuntungan) tetap di backend. Soroban hanya menyimpan ringkasan transaksi sebagai bukti permanen.
- **Custodial wallet per merchant**: backend mengelola Stellar account tiap warung secara transparan. Merchant tidak perlu tahu wallet mereka ada.
- **Stablecoin sebagai unit akuntansi on-chain**: nominal IDR dikonversi ke representasi stablecoin (USDC / IDR-stablecoin) hanya untuk keperluan pencatatan on-chain — bukan agar warung memegang aset kripto.

---

## 2. Tech Stack

| Layer | Teknologi | Alasan Pemilihan |
|---|---|---|
| Frontend (Merchant App) | **Next.js 14 (App Router) + TypeScript** | SSR/ISR untuk dashboard performant, React Server Components untuk data fetching ringan, mendukung PWA untuk dipakai sebagai POS di tablet/HP warung |
| UI Layer | **Tailwind CSS + shadcn/ui** | Cepat membangun komponen dashboard & POS yang konsisten |
| State/data fetching | **TanStack Query** | Caching & sinkronisasi data transaksi real-time dari backend |
| Backend API | **Express.js (Node.js) + TypeScript** | Stack matang untuk REST API, webhook handler (QRIS callback), mudah diintegrasikan ke berbagai SDK pihak ketiga |
| Validasi & schema | **Zod** | Validasi payload webhook & request API, schema sharing antara backend dan frontend |
| ORM / DB Access | **Prisma** | Migrasi skema terstruktur, type-safe query ke Postgres |
| Database utama | **PostgreSQL** | Menyimpan data off-chain: profil merchant, katalog produk, riwayat transaksi, status stok, cache skor kredit |
| Cache & Queue | **Redis + BullMQ** | Job queue untuk proses pencatatan on-chain secara asinkron (konfirmasi transaksi → submit ke Soroban), retry logic |
| Background workers | **Node.js worker process (Express terpisah / standalone script)** | Menjalankan job: submit transaksi on-chain, polling status ledger |
| Auth | **JWT + refresh token (Express middleware)** | Sesi merchant (POS) |
| Payment Gateway / QRIS | **Integrasi PJSP lokal** (mis. Midtrans, Xendit, atau bank QRIS API) | Menerima notifikasi pembayaran QRIS real-time |
| Stablecoin & on/off-ramp | **Stellar Anchor (SEP-24/SEP-31) atau partner on/off-ramp lokal** | Jembatan antara Rupiah fiat dan representasi stablecoin untuk pencatatan on-chain |
| Blockchain | **Stellar Network** | Throughput tinggi, fee sangat rendah, didesain untuk pembayaran & aset, native stablecoin support |
| Smart Contract Platform | **Soroban (Stellar smart contracts)** | Platform smart contract resmi Stellar, dieksekusi sebagai WASM |
| Bahasa Smart Contract | **Rust + soroban-sdk** | Bahasa wajib untuk Soroban; `#![no_std]`, dikompilasi ke WASM |
| Stellar SDK (off-chain) | **Stellar SDK for JS (`@stellar/stellar-sdk`)** dipakai di backend Express | Submit transaksi, invoke contract, query ledger dari Node.js |
| Wallet/Key management | **Custodial key store (KMS/HSM atau env-encrypted) di backend** | Menyembunyikan kompleksitas wallet dari merchant |
| Infra/Deploy | **Docker Compose** (dev), **Railway/Render/Fly.io atau VPS** (prod), **Vercel** untuk frontend Next.js | Pemisahan deploy frontend (Vercel) dan backend+worker (container) |
| Observability | **Pino (logging) + Sentry** | Tracing error di pipeline pencatatan on-chain |
| Testing | **Vitest/Jest (backend & frontend)**, **`cargo test` + `soroban-sdk` testutils (contracts)** | Unit & integration test tiap layer |

---

## 3. Arsitektur Sistem

```
                         ┌─────────────────────────┐
                         │   Pembeli (End Customer) │
                         └────────────┬─────────────┘
                                      │ bayar via QRIS / cash / e-wallet (IDR)
                                      ▼
                         ┌─────────────────────────┐
                         │  Payment Gateway / PJSP   │  (Midtrans/Xendit/Bank QRIS)
                         └────────────┬─────────────┘
                                      │ webhook notifikasi pembayaran (QRIS)
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         ZetaFi Backend (Express.js)                    │
│                                                                          │
│  ┌────────────┐   ┌───────────────┐   ┌──────────────────────────┐   │
│  │ Webhook API │──▶│ Queue (BullMQ)│──▶│ On-chain Writer Worker     │   │
│  │ /qris/cb    │   │  + Redis      │   │ - konversi nominal IDR     │   │
│  └────────────┘   └───────────────┘   │   ke representasi stablecoin│   │
│         │                              │ - submit tx ke ledger        │   │
│  ┌────────────┐                        │   contract di Soroban        │   │
│  │ Manual API  │──▶ (langsung queue)   └─────────────┬─────────────┘   │
│  │ /tx/confirm │                                       │                 │
│  └────────────┘                                       │                 │
│         │                                             │                 │
│         ▼                                             ▼                 │
│  ┌────────────┐◀──────────────────────────────────────┘                │
│  │ PostgreSQL  │  katalog produk, stok, riwayat transaksi, hash Stellar │
│  │ (Prisma)    │                                                         │
│  └────────────┘                                                          │
│         ▲                                                                │
│         │ REST API (merchant dashboard / kasir POS)                     │
└─────────┼──────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│ Next.js Merchant App │
│ (Kasir / POS /       │
│  Manajemen Produk /  │
│  Laporan Penjualan)  │
└─────────────────────┘

                    Stellar Network / Soroban (on-chain audit trail)
┌──────────────────────────────────────────────────────────────────────┐
│  contracts/                                                            │
│   └─ ledger.rs  : append-only record tiap transaksi yang dikonfirmasi  │
│                   (nominal, timestamp, hash referensi — tanpa PII)     │
│                                                                          │
│  Stablecoin: USDC (Circle, issued on Stellar) atau IDR-stablecoin       │
│  Anchor (SEP-24/31): jembatan fiat IDR ↔ unit akuntansi on-chain        │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Alur Transaksi via QRIS

1. Pembeli scan QRIS warung → bayar dari e-wallet/m-banking.
2. PJSP mengirim webhook ke `POST /api/qris/callback` di backend Express.
3. Backend memvalidasi signature webhook, menyimpan transaksi ke Postgres (status `received`), dan mengurangi stok produk yang terjual.
4. Job ditambahkan ke `onchain-writer-queue`.
5. Worker mengambil job: mengonversi nominal IDR ke representasi stablecoin, memanggil fungsi `record_transaction` pada **ledger contract** di Soroban melalui Stellar SDK, menunggu konfirmasi ledger.
6. Hash transaksi Stellar disimpan kembali ke Postgres (status `settled`). Dashboard merchant via TanStack Query menampilkan update real-time.

### 3.2 Alur Transaksi Manual (Cash / Metode Lain)

1. Penjual memilih produk & jumlah di aplikasi kasir.
2. Penjual menekan tombol **Konfirmasi Penjualan**.
3. Backend menerima `POST /api/transactions/confirm`, menyimpan transaksi ke Postgres, dan mengurangi stok.
4. Job dikirim ke queue yang sama dengan alur QRIS — transaksi manual pun dicatat on-chain dengan cara identik.
5. Hash Stellar disimpan ke Postgres; dashboard diperbarui.

---

## 4. Struktur Repository (Monorepo)

```
zetafi/
├── web/                         # Next.js — Merchant App (POS + Dashboard)
│   ├── app/
│   │   ├── (merchant)/
│   │   │   ├── kasir/           # halaman POS: pilih produk, konfirmasi penjualan
│   │   │   ├── produk/          # manajemen produk: tambah, edit harga beli/jual
│   │   │   ├── stok/            # pantau sisa stok per produk
│   │   │   └── laporan/         # ringkasan penjualan & keuntungan
│   │   └── api/                 # (opsional) BFF routes / proxy ke backend
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── api/                         # Express.js backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── qris.routes.ts        # webhook QRIS dari payment gateway
│   │   │   ├── transaction.routes.ts # konfirmasi manual & riwayat transaksi
│   │   │   └── product.routes.ts     # CRUD produk, harga, stok
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── stock.service.ts      # logika pengurangan & validasi stok
│   │   │   ├── stellar.service.ts    # wrapper @stellar/stellar-sdk
│   │   │   └── payment-gateway.service.ts
│   │   ├── queues/
│   │   │   ├── onchain-writer.queue.ts
│   │   │   └── onchain-writer.worker.ts
│   │   ├── middlewares/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── server.ts
│   └── package.json
│
├── contracts/                   # Soroban smart contracts (Rust)
│   ├── ledger/
│   │   ├── src/lib.rs           # record_transaction, get_merchant_history
│   │   └── Cargo.toml
│   └── Cargo.toml               # workspace root
│
├── packages/
│   ├── shared-types/            # Zod schema & TS types dipakai web + api
│   └── stellar-config/          # network passphrase, contract IDs, RPC URL per environment
│
├── docker-compose.yml           # postgres, redis, api, web (dev)
├── .env.example
└── README.md
```

---

## 5. Smart Contract (Soroban / Rust)

Reference belajar: *RiseIn — APAC Stellar Hackathon, modul Soroban Rust* — kontrak pada proyek ini mengikuti pola dasar yang sama: `#![no_std]`, `soroban_sdk`, dikompilasi ke target `wasm32-unknown-unknown`.

### 5.1 `ledger` contract

Tujuan: mencatat setiap transaksi yang sudah dikonfirmasi (QRIS maupun manual) sebagai entri *append-only* yang tidak bisa diubah atau dihapus.

Fungsi inti:
- `record_transaction(env, merchant_id, amount, timestamp, tx_ref_hash)` — hanya bisa dipanggil oleh address backend yang diotorisasi (admin/operator role). Dipanggil sekali per transaksi yang berhasil dikonfirmasi.
- `get_merchant_history(env, merchant_id, from, to)` — read-only, mengembalikan daftar transaksi dalam rentang waktu tertentu. Berguna untuk rekonsiliasi atau audit eksternal.
- `get_total_volume(env, merchant_id, period)` — agregasi cepat total omzet dalam periode tertentu.

### 5.2 Pertimbangan Desain Kontrak

- **Privasi data**: detail transaksi granular (item yang dibeli, nama pembeli, dsb.) tetap di Postgres off-chain. Yang ditulis on-chain adalah nominal, timestamp, dan hash referensi — cukup untuk verifikasi omzet tanpa membocorkan detail bisnis sensitif.
- **Role-based authorization**: hanya backend service account yang punya izin invoke `record_transaction`, untuk mencegah data palsu disuntikkan langsung ke chain.
- **Idempotency**: setiap job on-chain writer menyertakan `tx_ref_hash` unik dari transaksi Postgres. Jika job dijalankan ulang (retry), contract harus menolak hash yang sudah pernah direkam.
- **Upgradability**: gunakan pola contract proxy/upgrade Soroban jika diperlukan revisi logic di kemudian hari.
- **Testing**: jalankan `cargo test` dengan `soroban_sdk::testutils` sebelum build WASM dan sebelum deploy ke testnet/mainnet.

### 5.3 Build & Deploy Contract

```bash
# Build contract ke WASM
cd contracts/ledger
cargo build --target wasm32-unknown-unknown --release

# Optimasi WASM (opsional, soroban-cli)
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/ledger.wasm

# Deploy ke testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/ledger.wasm \
  --source <ACCOUNT_SECRET> \
  --network testnet
```

---

## 6. Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/zetafi
REDIS_URL=redis://localhost:6379

# Stellar / Soroban
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
LEDGER_CONTRACT_ID=
BACKEND_SIGNER_SECRET=        # secret key operator (simpan di KMS/secret manager di production)

# Anchor / on-off ramp
ANCHOR_SEP24_URL=
ANCHOR_SEP31_URL=

# Payment Gateway QRIS
PAYMENT_GATEWAY_API_KEY=
PAYMENT_GATEWAY_WEBHOOK_SECRET=

# Auth
JWT_SECRET=

# App
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

---

## 7. Menjalankan Proyek Secara Lokal

```bash
# 1. Clone & install dependencies (workspace monorepo, pnpm)
pnpm install

# 2. Jalankan infra pendukung (Postgres + Redis)
docker compose up -d postgres redis

# 3. Migrasi database
pnpm --filter api prisma migrate dev

# 4. Jalankan backend Express
pnpm --filter api dev

# 5. Jalankan frontend Next.js
pnpm --filter web dev

# 6. (Opsional) Build & deploy ledger contract ke testnet Stellar
cd contracts/ledger && cargo build --target wasm32-unknown-unknown --release
```

---

## 8. Roadmap Singkat

1. **MVP Kasir**: tambah produk (harga beli & jual), kasir klik produk → konfirmasi manual, stok berkurang otomatis, dashboard ringkasan penjualan & keuntungan.
2. **Integrasi QRIS**: webhook dari payment gateway → konfirmasi transaksi otomatis tanpa input manual penjual.
3. **On-chain Audit Trail**: aktifkan on-chain writer worker → tulis setiap transaksi terkonfirmasi ke `ledger` contract di testnet Stellar.
4. **Laporan & Rekonsiliasi**: halaman laporan harian/mingguan/bulanan dengan ekspor, termasuk rekonsiliasi antara data Postgres dan data on-chain.
5. **Mainnet & Anchor Integration**: integrasi resmi dengan Stellar Anchor untuk on/off-ramp IDR ↔ stablecoin, audit smart contract, lalu migrasi ke mainnet.

---

## 9. Catatan untuk AI Coding Agent

- Proyek ini adalah **monorepo** dengan dua domain utama yang harus dijaga konsistensi tipe datanya: `web` (Next.js/TS) dan `api` (Express/TS). Schema bersama (Zod) ada di `packages/shared-types` — selalu sinkronkan bila menambah field baru pada produk/transaksi.
- **Logika bisnis utama ada di backend**, bukan di contract. Kalkulasi stok, keuntungan, dan harga satuan semuanya dikerjakan di `api/src/services/` — contract hanya menerima ringkasan transaksi yang sudah final.
- Penulisan ke blockchain **hanya** terjadi dari `api/src/queues/onchain-writer.worker.ts` melalui job queue, tidak pernah langsung dari route handler — ini untuk memastikan retry-safety dan idempotency saat invoke smart contract.
- Saat mengubah logic di `contracts/ledger`, jalankan `cargo test` sebelum build WASM, dan update `LEDGER_CONTRACT_ID` di `.env` / `packages/stellar-config` setelah redeploy.
- Jangan menaruh secret key (`BACKEND_SIGNER_SECRET`, API key payment gateway) di kode atau file yang ter-commit — semua lewat environment variable / secret manager.
- Setiap field yang dianggap "sensitif secara bisnis" (rincian item, nama pembeli, dsb.) **tidak boleh** ditulis ke smart contract — hanya nominal, timestamp, dan hash referensi yang aman untuk on-chain.
- **Pengurangan stok harus atomic**: saat `stock.service.ts` mengurangi stok, gunakan transaksi Prisma untuk memastikan tidak ada race condition jika dua transaksi terjadi bersamaan pada produk yang sama.
