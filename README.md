# ZetaFi

**ZetaFi** adalah aplikasi kasir & pencatatan keuangan untuk UMKM (warung, toko kelontong, pedagang kaki lima) yang mengubah setiap transaksi QRIS menjadi catatan permanen di blockchain Stellar, lalu memanfaatkan data on-chain tersebut sebagai skor kredit *trustless* untuk mengakses pembiayaan modal kerja dari protokol P2P lending / DeFi.

Pemilik warung tetap menerima dan bertransaksi dalam Rupiah seperti biasa (QRIS, e-wallet, m-banking). Seluruh kompleksitas kripto — wallet, gas fee, custody — disembunyikan di balik sistem; yang terlihat oleh pemilik warung hanyalah aplikasi kasir biasa dengan buku besar yang "tidak bisa dipalsukan".

> Dokumen ini ditulis agar dapat dipahami oleh AI coding agent (Claude Code, Cursor, dsb.) maupun developer manusia sebagai peta arsitektur sistem sebelum mulai membaca/menulis kode.

---

## 1. Konsep Produk

### 1.1 Masalah yang Diselesaikan

UMKM di Indonesia umumnya tidak memiliki riwayat keuangan yang dipercaya oleh institusi pembiayaan formal (bank, fintech lending). Pembukuan manual rentan direkayasa, sehingga lembaga pembiayaan kesulitan menilai kelayakan kredit dan UMKM kesulitan mendapat modal kerja tanpa agunan.

### 1.2 Solusi — Dua Lapis Produk

**Lapis 1 — Kasir & Ledger On-Chain (Core Product)**
1. Pembeli membayar via QRIS/e-wallet/m-banking dalam Rupiah seperti biasa — tidak ada perubahan UX di sisi pembeli.
2. Backend menerima notifikasi pembayaran dari payment gateway/PJSP QRIS.
3. Backend melakukan *settlement* nilai transaksi ke representasi stablecoin (mis. USDC, atau IDR-stablecoin seperti BIDR/IDRX) sebagai unit akuntansi on-chain — **bukan** agar warung memegang kripto, melainkan agar nilai transaksi punya representasi yang bisa dicatat dan diverifikasi di blockchain.
4. Detail transaksi (timestamp, nominal, hash referensi) ditulis ke **smart contract Soroban** di Stellar sebagai *append-only ledger*.
5. Pemilik warung melihat dashboard kasir & laporan keuangan biasa (Next.js) — tanpa tahu/mengelola wallet kripto. Custody dan key management dipegang sistem (custodial wallet per-merchant, dikelola backend).

**Lapis 2 — Credit Scoring & Lending (Extension)**
1. Riwayat omzet on-chain (append-only, immutable) menjadi input *credit scoring engine*.
2. Skor kredit dihitung dan disimpan/diverifikasi via smart contract sehingga lembaga pembiayaan (P2P lending, protokol DeFi) bisa memverifikasi omzet & skor secara langsung dari data on-chain — tanpa proses audit manual.
3. Saat pengajuan modal disetujui (oleh lender, atau secara otomatis berdasarkan aturan di smart contract), kontrak **lending pool** mencairkan dana dalam stablecoin.
4. Dana dikonversi otomatis via payment gateway lokal dan mendarat sebagai Rupiah di rekening bank/saldo QRIS warung.
5. Smart contract mencatat skedul pembayaran kembali (repayment) dari arus kas QRIS warung berikutnya.

### 1.3 Prinsip Desain Penting

- **Crypto-invisible UX**: Pemilik warung dan pembeli tidak pernah berinteraksi langsung dengan wallet, seed phrase, atau gas fee. Semua dalam Rupiah di permukaan.
- **On-chain = source of truth, bukan tempat compute berat**: Soroban contract menyimpan hash/ringkasan transaksi & state skor, bukan seluruh detail PII transaksi (lihat §5.4 — pertimbangan privasi).
- **Custodial wallet per merchant**: Backend mengelola Stellar account untuk tiap warung (dengan opsi migrasi ke non-custodial di masa depan via Soroban smart wallet/passkey).
- **Stablecoin sebagai unit settlement**, bukan tujuan akhir — IDR tetap menjadi unit yang dilihat user.

---

## 2. Tech Stack

| Layer | Teknologi | Alasan Pemilihan |
|---|---|---|
| Frontend (Merchant App + Lender Portal) | **Next.js 14 (App Router) + TypeScript** | SSR/ISR untuk dashboard performant, React Server Components untuk data fetching ringan, mendukung PWA untuk dipakai sebagai POS di tablet/HP warung |
| UI Layer | **Tailwind CSS + shadcn/ui** | Cepat membangun komponen dashboard & POS yang konsisten |
| State/data fetching | **TanStack Query** | Caching & sinkronisasi data transaksi real-time dari backend |
| Backend API | **Express.js (Node.js) + TypeScript** | Stack matang untuk REST API, webhook handler (QRIS callback), mudah diintegrasikan ke berbagai SDK pihak ketiga |
| Validasi & schema | **Zod** | Validasi payload webhook & request API, schema sharing antara backend dan frontend |
| ORM / DB Access | **Prisma** | Migrasi skema terstruktur, type-safe query ke Postgres |
| Database utama | **PostgreSQL** | Menyimpan data off-chain: profil merchant, riwayat transaksi mentah, status job settlement, cache skor kredit |
| Cache & Queue | **Redis + BullMQ** | Job queue untuk proses settlement asinkron (QRIS → stablecoin → submit ke Soroban), retry logic |
| Background workers | **Node.js worker process (Express terpisah / standalone script)** | Menjalankan job: settlement, submit transaksi on-chain, polling status |
| Auth | **JWT + refresh token (Express middleware)**, opsional **Clerk/Auth.js** untuk lender portal | Sesi merchant (POS) dan sesi lender (portal due diligence) punya kebutuhan otorisasi berbeda |
| Payment Gateway / QRIS | **Integrasi PJSP lokal** (mis. Midtrans, Xendit, atau bank QRIS API) | Menerima notifikasi pembayaran QRIS dan melakukan disbursement IDR saat pencairan pinjaman |
| Stablecoin & on/off-ramp | **Stellar Anchor (SEP-24/SEP-31) atau partner on/off-ramp lokal** | Jembatan resmi antara Rupiah fiat dan aset on-chain (USDC di Stellar / IDR-stablecoin) |
| Blockchain | **Stellar Network** | Throughput tinggi, fee sangat rendah, didesain untuk pembayaran & aset, native stablecoin support (USDC issued by Circle on Stellar) |
| Smart Contract Platform | **Soroban (Stellar smart contracts)** | Platform smart contract resmi Stellar, dieksekusi sebagai WASM |
| Bahasa Smart Contract | **Rust + soroban-sdk** | Bahasa wajib untuk Soroban; `#![no_std]`, dikompilasi ke WASM |
| Stellar SDK (off-chain) | **Stellar SDK for JS (`@stellar/stellar-sdk`)** dipakai di backend Express | Submit transaksi, invoke contract, query ledger dari Node.js |
| Wallet/Key management | **Custodial key store (KMS/HSM atau env-encrypted) di backend**, dengan jalur migrasi ke **Soroban smart wallet (passkey-based)** | Menyembunyikan kompleksitas wallet dari merchant di fase awal |
| Infra/Deploy | **Docker Compose** (dev), **Railway/Render/Fly.io atau VPS** (prod), **Vercel** untuk frontend Next.js | Pemisahan deploy frontend (Vercel) dan backend+worker (container) |
| Observability | **Pino (logging) + Sentry** | Tracing error di pipeline settlement yang melibatkan banyak pihak eksternal (PJSP, anchor, Stellar RPC) |
| Testing | **Vitest/Jest (backend & frontend)**, **`cargo test` + `soroban-sdk` testutils (contracts)** | Unit & integration test tiap layer |

---

## 3. Arsitektur Sistem

```
                         ┌─────────────────────────┐
                         │   Pembeli (End Customer) │
                         └────────────┬─────────────┘
                                      │ bayar via QRIS / e-wallet / m-banking (IDR)
                                      ▼
                         ┌─────────────────────────┐
                         │  Payment Gateway / PJSP   │  (Midtrans/Xendit/Bank QRIS)
                         └────────────┬─────────────┘
                                      │ webhook notifikasi pembayaran
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         ZetaFi Backend (Express.js)                    │
│                                                                          │
│  ┌────────────┐   ┌───────────────┐   ┌──────────────────────────┐   │
│  │ Webhook API │──▶│ Queue (BullMQ)│──▶│ Settlement Worker          │   │
│  │ /qris/cb    │   │  + Redis      │   │ - konversi IDR→stablecoin  │   │
│  └────────────┘   └───────────────┘   │ - submit tx ke Soroban     │   │
│         │                              │ - update skor kredit       │   │
│         ▼                              └─────────────┬─────────────┘   │
│  ┌────────────┐                                       │                 │
│  │ PostgreSQL  │◀──────────────────────────────────────┘                │
│  │ (Prisma)    │  cache transaksi, status merchant, skor kredit         │
│  └────────────┘                                                          │
│         ▲                                                                │
│         │ REST API (merchant dashboard, lender portal)                  │
└─────────┼──────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐        ┌─────────────────────┐
│ Next.js Merchant App │        │ Next.js Lender Portal│
│ (Kasir / POS / Buku  │        │ (lihat skor kredit,   │
│  besar transparan)   │        │  approve pinjaman)    │
└─────────────────────┘        └─────────────────────┘

                    Stellar Network / Soroban (on-chain)
┌──────────────────────────────────────────────────────────────────────┐
│  contracts/                                                            │
│   ├─ ledger.rs        : append-only record tiap transaksi QRIS         │
│   ├─ credit_score.rs  : agregasi omzet → skor kredit on-chain          │
│   └─ lending_pool.rs  : pengajuan, approval, disbursement, repayment   │
│                                                                          │
│  Stablecoin: USDC (Circle, issued on Stellar) atau IDR-stablecoin       │
│  Anchor (SEP-24/31): jembatan fiat IDR ↔ aset on-chain                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Alur Transaksi Harian (Kasir)

1. Pembeli scan QRIS warung → bayar dari e-wallet/m-banking.
2. PJSP mengirim webhook ke `POST /api/qris/callback` di backend Express.
3. Backend memvalidasi signature webhook, menyimpan transaksi mentah ke Postgres (status `received`).
4. Job ditambahkan ke queue `settlement-queue`.
5. Worker mengambil job: menghitung ekuivalen stablecoin, memanggil fungsi `record_transaction` pada **ledger contract** di Soroban (melalui Stellar SDK), menunggu konfirmasi ledger.
6. Hash transaksi Stellar disimpan kembali ke Postgres (status `settled`), dashboard merchant via TanStack Query menampilkan update real-time.

### 3.2 Alur Pengajuan Modal (Lending)

1. Pemilik warung mengajukan pinjaman dari Merchant App.
2. Backend memanggil **credit_score contract** untuk membaca skor terkini (dihitung dari agregasi data ledger on-chain).
3. Lender (di Lender Portal) melihat skor & histori omzet langsung dari data on-chain (read-only call ke contract, tidak melalui database backend yang bisa dimanipulasi).
4. Lender menyetujui (atau smart contract menyetujui otomatis berdasarkan threshold yang diset) → **lending_pool contract** memindahkan stablecoin dari pool ke wallet custodial merchant.
5. Backend mendeteksi event pencairan on-chain → memicu disbursement IDR via payment gateway ke rekening/saldo QRIS merchant.
6. Cicilan/repayment otomatis dipotong dari arus kas QRIS berikutnya sesuai skedul yang tercatat di `lending_pool` contract.

---

## 4. Struktur Repository (Monorepo)

```
zetafi/
├── apps/
│   ├── web/                     # Next.js — Merchant App + Lender Portal
│   │   ├── app/
│   │   │   ├── (merchant)/      # dashboard kasir, riwayat transaksi, ajukan modal
│   │   │   ├── (lender)/        # portal verifikasi skor kredit & approval
│   │   │   └── api/              # (opsional) BFF routes / proxy ke backend
│   │   ├── components/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── api/                     # Express.js backend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── qris.routes.ts        # webhook QRIS
│       │   │   ├── merchant.routes.ts
│       │   │   ├── lending.routes.ts
│       │   │   └── credit-score.routes.ts
│       │   ├── controllers/
│       │   ├── services/
│       │   │   ├── settlement.service.ts # konversi IDR→stablecoin
│       │   │   ├── stellar.service.ts    # wrapper @stellar/stellar-sdk
│       │   │   ├── anchor.service.ts     # integrasi SEP-24/31 on/off-ramp
│       │   │   └── payment-gateway.service.ts
│       │   ├── queues/
│       │   │   ├── settlement.queue.ts
│       │   │   └── settlement.worker.ts
│       │   ├── middlewares/
│       │   ├── prisma/
│       │   │   └── schema.prisma
│       │   └── server.ts
│       └── package.json
│
├── contracts/                   # Soroban smart contracts (Rust)
│   ├── ledger/
│   │   ├── src/lib.rs           # record_transaction, get_history
│   │   └── Cargo.toml
│   ├── credit_score/
│   │   ├── src/lib.rs           # compute_score, get_score
│   │   └── Cargo.toml
│   ├── lending_pool/
│   │   ├── src/lib.rs           # request_loan, approve, disburse, repay
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

## 5. Smart Contracts (Soroban / Rust)

Reference belajar: *RiseIn — APAC Stellar Hackathon, modul Soroban Rust* — kontrak pada proyek ini mengikuti pola dasar yang sama: `#![no_std]`, `soroban_sdk`, dikompilasi ke target `wasm32-unknown-unknown`.

### 5.1 `ledger` contract

Tujuan: mencatat setiap transaksi QRIS yang sudah disettle sebagai entri *append-only*.

Fungsi inti (gambaran, bukan kode final):
- `record_transaction(env, merchant_id, amount, timestamp, tx_ref_hash)` — hanya bisa dipanggil oleh address backend yang diotorisasi (admin/operator role).
- `get_merchant_history(env, merchant_id, from, to)` — read-only, dipanggil lender portal untuk verifikasi omzet.
- `get_total_volume(env, merchant_id, period)` — agregasi cepat untuk input scoring.

### 5.2 `credit_score` contract

Tujuan: menghitung & menyimpan skor kredit berbasis data dari `ledger` contract — formula transparan dan bisa diverifikasi siapa pun.

Fungsi inti:
- `compute_score(env, merchant_id)` — membaca riwayat dari `ledger`, menghasilkan skor (mis. berbasis konsistensi omzet, frekuensi transaksi, tren pertumbuhan).
- `get_score(env, merchant_id)` — read-only untuk lender.

### 5.3 `lending_pool` contract

Tujuan: mengatur siklus pinjaman modal kerja secara trustless.

Fungsi inti:
- `request_loan(env, merchant_id, amount)`
- `approve_loan(env, loan_id, lender_id)` — bisa manual oleh lender atau otomatis jika skor ≥ threshold pool.
- `disburse(env, loan_id)` — transfer stablecoin dari pool ke wallet merchant, emit event untuk dipantau backend.
- `repay(env, loan_id, amount)` — dipanggil otomatis oleh backend tiap kali ada surplus arus kas QRIS sesuai skedul.

### 5.4 Pertimbangan Desain Kontrak

- **Privasi data**: detail transaksi granular (item yang dibeli, dsb.) tetap di Postgres off-chain. Yang ditulis on-chain adalah nominal, timestamp, dan hash referensi — cukup untuk verifikasi omzet tanpa membocorkan detail bisnis sensitif secara publik.
- **Role-based authorization**: hanya backend service account (atau di masa depan, oracle terverifikasi) yang punya izin invoke `record_transaction`, untuk mencegah merchant menyuntik data omzet palsu langsung ke chain.
- **Upgradability**: gunakan pola contract proxy/upgrade Soroban jika diperlukan revisi logic scoring di kemudian hari.
- **Testing**: setiap contract punya test menggunakan `soroban_sdk::testutils` sebelum deploy ke testnet/mainnet Stellar.

### 5.5 Build & Deploy Contracts (ringkas)

```bash
# Build seluruh contract ke WASM
cd contracts
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

## 6. Environment Variables (ringkasan)

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/zetafi
REDIS_URL=redis://localhost:6379

# Stellar / Soroban
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
LEDGER_CONTRACT_ID=
CREDIT_SCORE_CONTRACT_ID=
LENDING_POOL_CONTRACT_ID=
BACKEND_SIGNER_SECRET=        # secret key operator (disimpan di KMS/secret manager di production)

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
# 1. Clone & install dependencies (workspace monorepo, mis. pnpm)
pnpm install

# 2. Jalankan infra pendukung (Postgres + Redis)
docker compose up -d postgres redis

# 3. Migrasi database
pnpm --filter api prisma migrate dev

# 4. Jalankan backend Express
pnpm --filter api dev

# 5. Jalankan frontend Next.js
pnpm --filter web dev

# 6. (Opsional) Build & deploy contracts ke testnet Stellar
cd contracts && cargo build --target wasm32-unknown-unknown --release
```

---

## 8. Roadmap Singkat

1. **MVP Kasir**: terima QRIS, catat transaksi off-chain dulu (Postgres), dashboard dasar.
2. **On-chain Ledger**: aktifkan settlement worker → tulis ke `ledger` contract di testnet Stellar.
3. **Credit Scoring**: implementasi `credit_score` contract + lender portal read-only.
4. **Lending Pool**: implementasi siklus pinjaman penuh (request → approve → disburse → repay) di testnet.
5. **Mainnet & Anchor Integration**: integrasi resmi dengan Stellar Anchor untuk on/off-ramp IDR↔stablecoin, audit smart contract, lalu migrasi ke mainnet.
6. **Non-custodial migration (opsional)**: eksplorasi Soroban smart wallet berbasis passkey agar merchant punya kontrol penuh atas asetnya tanpa mengorbankan UX sederhana.

---

## 9. Catatan untuk AI Coding Agent

- Proyek ini adalah **monorepo** dengan tiga domain berbeda yang harus dijaga konsistensi tipe datanya: `apps/web` (Next.js/TS), `apps/api` (Express/TS), dan `contracts` (Rust/Soroban). Schema bersama (Zod) ada di `packages/shared-types` — selalu sinkronkan bila menambah field baru pada transaksi/loan.
- Penulisan ke blockchain **hanya** terjadi dari `apps/api/src/services/stellar.service.ts` melalui job queue (`settlement.queue.ts`), tidak pernah langsung dari route handler — ini untuk memastikan retry-safety dan idempotency saat invoke smart contract.
- Saat mengubah logic di `contracts/*`, jalankan `cargo test` di masing-masing contract sebelum build WASM, dan update `CONTRACT_ID` terkait di `.env` / `packages/stellar-config` setelah redeploy.
- Jangan menaruh secret key (`BACKEND_SIGNER_SECRET`, API key payment gateway) di kode atau file yang ter-commit — semua lewat environment variable / secret manager.
- Setiap field yang dianggap "sensitif secara bisnis" (rincian item transaksi, nama pembeli, dsb.) **tidak boleh** ditulis ke smart contract — hanya nominal, timestamp, dan hash referensi yang aman untuk on-chain (lihat §5.4).
