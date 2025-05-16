import app from './app.js';
import dotenv from 'dotenv';

dotenv.config(); // Ensure .env is loaded

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on http://localhost:${PORT}`);
});