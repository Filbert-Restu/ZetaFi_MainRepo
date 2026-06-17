import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'zetafi-api' });
});

app.listen(port, () => {
  console.log(`ZetaFi API listening at http://localhost:${port}`);
});
