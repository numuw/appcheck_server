import axios from "axios";

export const pocketbaseRequest = axios.create({
  baseURL: process.env.POCKETBASE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});
