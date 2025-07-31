import { pocketbaseRequest } from "../utils/utils.js";

export const managedAvailability = async (req, res) => {
  try {
    const data = req.body;
    console.log("00000000000", data);

    if (!data) {
      return res.status(400).json({ error: "Missing request body" });
    }
    const response = await pocketbaseRequest({
      url: "/availability/single",
      method: "POST",
      data,
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    console.log(error?.response?.data);
    return res.status(500).json({ error: error.message });
  }
};

export const getEventTypeHandler = async (req, res) => {
  try {
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: "Missing request body" });
    }
    const response = await pocketbaseRequest({
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

export const bookManagedEvent = async (req, res) => {
  try {
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: "Missing request body" });
    }
    const response = await pocketbaseRequest({
      url: "/event/book/managed",
      method: "POST",
      data,
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const bookRoundRobinEvent = async (req, res) => {
  try {
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: "Missing request body" });
    }
    const response = await pocketbaseRequest({
      url: "/event/book/round-robin",
      method: "POST",
      data,
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
