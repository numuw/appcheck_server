import axios from "axios";

export const managedAvailability = async (req, res) => {
  const data = req.body;

  if (!body) {
    return res.status(400).json({ error: "Missing request body" });
  }
  const response = await axios(process.env.POCKETBASE_API_URL, {
    method: "POST",
    data,
  });

  return res.status(response.status).json(await response.json());
};

export const getEventTypeHandler = async (req, res) => {
  try {
    const data = req.body;
    const url = `${process.env.POCKETBASE_API_URL}/event-type/single`;
    const response = await axios(url, {
      method: "POST",
      data,
      headers: {
        "Content-Type": "application/json",
      },
    });

    return res.status(response.status).json(await response.data);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
};
