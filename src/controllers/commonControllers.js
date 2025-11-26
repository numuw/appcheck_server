import { pocketbaseRequest } from "../utils/utils.js";

export const managedAvailability = async (req, res) => {
  try {
    const data = req.body;

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
export const getUserEvent = async (req, res) => {
  try {
    const data = req.body;
    const headers = req.headers;
    if (!data) {
      return res.status(400).json({ error: "Missing request body" });
    }
    const response = await pocketbaseRequest({
      url: "/get-user-event",
      method: "POST",
      data,
      headers,
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
    return res.status(500).json(error.response.data);
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

export const getMemberEventSettings = async (req, res) => {
  try {
    const memberId = req.params.id;
    const response = await pocketbaseRequest({
      url: `/members/event-settings/${memberId}`,
      method: "GET",
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const data = req.body;
    const response = await pocketbaseRequest({
      url: `/cancel-booking`,
      method: "PATCH",
      data,
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getBooking = async (req, res) => {
  try {
    console.log(req.query);
    const bookingId = req.query.bookingId;
    if (!bookingId) {
      return res.status(400).json({ error: "Missing booking ID" });
    }
    const response = await pocketbaseRequest({
      url: `/bookings/get-one?bookingId=${bookingId}`,
      method: "GET",
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const rescheduleBooking = async (req, res) => {
  try {
    const data = req.body;
    const response = await pocketbaseRequest({
      url: `/reschedule-booking`,
      method: "PATCH",
      data,
    });
    return res.status(response.status).json(await response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const reinviteUser = async (req, res) => {
  try {
    const authorization = req.headers.authorization;
    const response = await pocketbaseRequest({
      url: `/re-invite-user`,
      method: "POST",
      data: req.body,
      headers: {
        Authorization: authorization,
      },
    });
    return res.status(200).json(response.data);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error });
  }
};

export const updateMemberData = async (req, res) => {
  try {
    const data = req.body;
    const authorization = req.headers.authorization;
    console.log(data);
    const response = await pocketbaseRequest({
      url: `/update-member-data`,
      method: "POST",
      data,
      headers: {
        Authorization: authorization,
      },
    });
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const impersonation = async (req, res) => {
  try {
    const authorization = req.headers.authorization;
    const body = req.body;
    const response = await pocketbaseRequest({
      url: `/custom-impersonate`,
      method: "POST",
      data: body,
      headers: {
        Authorization: authorization,
      },
    });
    console.log(response.data);
    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Error in impersonation:", error);
    return res.status(500).json({ error: error.message });
  }
};
