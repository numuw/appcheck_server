import { request } from "../utils/utils.js";

export const managedAvailability = async (req, res) => {
  try {
    const data = req.body;

    if (!data) {
      return res.status(400).json({ error: "Missing request body" });
    }
    const response = await request({
      url: "/availability/single",
      method: "POST",
      data,
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
};

export const getEventTypeHandler = async (req, res) => {
  try {
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: "Missing request body" });
    }
    const response = await request({
      url: "/event-type/single",
      method: "POST",
      data,
    });

    return res.status(response.status).json(await response.data);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
};
