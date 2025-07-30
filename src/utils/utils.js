import axios from "axios";

export const request = axios.create({
  baseURL: process.env.POCKETBASE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});
