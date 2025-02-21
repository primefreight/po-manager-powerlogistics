import axios from "axios";

export const API_URL =
  process.env.NODE_ENV === "development"
    ? "https://primefreight.betty.app/api/runtime/fba8c23dd1104240bfdb9a1b10ef6dbe"
    : "https://primefreight.betty.app/api/runtime/da93364a26fb4eeb9e56351ecec79abb";

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const obtainJwtToken = async () => {
  const query = `
    mutation Login($authProfileUuid: String!, $username: String!, $password: String!) {
      login(authProfileUuid: $authProfileUuid, username: $username, password: $password) {
        jwtToken
        refreshToken
      }
    }
  `;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        API_URL,
        {
          query,
          variables: {
            authProfileUuid: "17838b935c5a46eebc885bae212d6d86",
            username: "agents",
            password: "admin@123",
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (response.status !== 200) {
        throw new Error("Server Error, retrying...");
      }
      if (response?.data?.errors && response.data.errors.length > 0) {
        console.error(
          `Error obtaining JWT token: ${response.data.errors[0].message}`
        );
        if (attempt < MAX_RETRIES) {
          throw new Error("GraphQL Error");
        } else {
          return [false, response.data.errors[0].message];
        }
      } else if (response?.data?.data?.login?.jwtToken !== null) {
        return [true, response?.data?.data?.login?.jwtToken];
      }
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Attempt ${attempt} failed. Retrying in ${RETRY_DELAY}ms.`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error("Error obtaining JWT token:", error);
        return [false, error];
      }
    }
  }
};

const makeGraphQLRequest = async (query, variables = {}) => {
  const fetchJwtToken = await obtainJwtToken();
  let jwtToken;

  if (!fetchJwtToken[0]) {
    return fetchJwtToken;
  } else {
    jwtToken = fetchJwtToken[1];
  }

  const config = {
    method: "post",
    url: API_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwtToken}`,
    },
    data: {
      query,
      variables,
    },
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios(config);
      if (response.status !== 200) {
        throw new Error("Server error, retrying....");
      }
      if (response?.data?.errors && response.data.errors.length > 0) {
        if (attempt < MAX_RETRIES) {
          throw new Error("GraphQL error, retrying...");
        } else {
          return [false, response.data.errors[0].message];
        }
      } else if (response?.data?.data !== null) {
        return [true, response.data.data];
      }
      return response?.data?.data;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Attempt ${attempt} failed. Retrying in ${RETRY_DELAY}ms.`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error("All retry attempts failed: ", error);
        return [false, error];
      }
    }
  }
};

const getShipmentDetail = async (id) => {
  const query = `{
    allShipments(where: { id: { eq: ${id} } }) {
      results {
        id
        purchaseOrders {
          id
          orderNumbers
          styleNumbers {
            id
            styleNumber
          }
        }
        styleNumbersRelation {
          id
        }
        companyRelation {
          id
        }
      }
      totalCount
    }
  }`;

  const data = await makeGraphQLRequest(query);
  if (data[0]) {
    const result = [data[0], data[1]?.allShipments?.results?.[0]];
    return result;
  } else {
    return data;
  }
};

const getBookingDetail = async (id) => {
  const query = `{
    allBooking (where: {id: {eq: ${id}}}) {
      results {
        id
        styleNumberRelation {
          id
          styleNumber
          pos {
            id
            orderNumbers
          }
        }
        customer {
          id
        }
        pos {
          id
          orderNumbers
          styleNumbers {
            id
            styleNumber
          }
        }
      }
      totalCount
    }
  }`;

  const data = await makeGraphQLRequest(query);
  if (data[0]) {
    const result = [data[0], data[1]?.allBooking?.results?.[0]];
    return result;
  } else {
    return data;
  }
};

/**
 * Checks whether a purchase order exists using the order number,
 * shipper id, and customer id.
 */
const checkPurchaseOrderExistence = async (orderNumber, shipperId, customerId) => {
  const query = `{
    allPurchaseOrder(
      where: {
        _and: [
          { orderNumbers: { eq: "${orderNumber}" } },
          { bookings: { shipper: { id: { eq: ${shipperId} } } } },
          { bookings: { customer: { id: { eq: ${customerId} } } } }
        ]
      }
      take: 200
      skip: 0
    ) {
      results {
        id
        orderNumbers
        bookings { 
          id
          shipper { id, companyName }
          customer { id, companyName }
        }
        styleNumbers {
          id
          styleNumber
        }
      }
      totalCount
    }
  }`;
  const data = await makeGraphQLRequest(query);
  if (data[0]) {
    const result = [data[0], data[1]?.allPurchaseOrder];
    return result;
  } else {
    return data;
  }
};

/**
 * Checks whether a style number exists using the style number,
 * purchase order's order number, and shipment id.
 */
const checkStyleNumberExistence = async (styleNumber, orderNumber, shipmentID) => {
  const query = `{
    allStyleNumber(
      where: {
        _and: [
          { styleNumber: { eq: "${styleNumber}" } },
          { pos: { orderNumbers: { eq: "${orderNumber}" } } },
          { shipments: { id: { eq: ${shipmentID} } } }
        ]
      }
      take: 200
      skip: 0
    ) {
      results {
        id
        pos {
          orderNumbers
        }
        shipments {
          id
        }
      }
      totalCount
    }
  }`;
  const data = await makeGraphQLRequest(query);
  if (data[0]) {
    return [data[0], data[1]?.allStyleNumber];
  } else {
    return data;
  }
};

const addOrUpdate = async (actionId, payload) => {
  const query = {
    query: "mutation { action(id: $action_id input: $input )} ",
    variables: { action_id: actionId, input: { payload } },
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(API_URL, query);
      if (response.status !== 200) {
        throw new Error("Server Error, retrying....");
      }
      const result = response?.data?.data?.action?.results
        ? [true, response.data.data.action.results]
        : [false];
      if (result[0] === false) {
        const errorMessage = response?.data?.errors[0].message;
        return [false, errorMessage];
      }
      return result;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Attempt ${attempt} failed. Retrying in ${RETRY_DELAY}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error("All retry attempts failed: ", error);
        throw error;
      }
    }
  }
};

const addPurchaseOrder = (payload) =>
  addOrUpdate("2ac1f7de7e134ec4943ac985a2f7f2d3", payload);
const updatePurchaseOrder = (payload) =>
  addOrUpdate("62ca74f99d3543d98fcb14fec2fee600", payload);
const addStyleNumber = (payload) =>
  addOrUpdate("6144dee3fbca4f77a0b8c2487e825e0b", payload);
const updateStyleNumber = (payload) =>
  addOrUpdate("7eb7dcd49e34457585f64b455d363621", payload);

const searchPOs = async (searchText, id) => {
  const query = `{
    allPurchaseOrder(where: {orderNumbers: {matches: "${searchText}"}, orderPurchaser: { id: {eq: ${id}}}}) {
      results {
        orderNumbers
        id
        styleNumbers {
          id
          styleNumber
        }
      }
      totalCount
    }
  }`;
  const variables = { searchText, id };

  const data = await makeGraphQLRequest(query, variables);
  if (data[0]) {
    const result = [data[0], data[1]?.allPurchaseOrder?.results];
    return result;
  } else {
    return data;
  }
};

// Remove quickAddSNs and quickAddPOs if not needed.
const quickAddPOs = async (searchText, id) => {
  const query = `{
    allPurchaseOrder(where: {orderNumbers: {eq: "${searchText}"}, orderPurchaser: { id: {eq: ${id}}}}) {
      results {
        orderNumbers
        id
        styleNumbers {
          id
          styleNumber
        }
      }
      totalCount
    }
  }`;
  const variables = { searchText, id };

  const data = await makeGraphQLRequest(query, variables);
  if (data[0]) {
    const result = [data[0], data[1]?.allPurchaseOrder?.results];
    return result;
  } else {
    return data;
  }
};

const searchSNs = async (searchText, id) => {
  const query = `{
    allStyleNumber(where: {styleNumber: {matches: "${searchText}"}, company: {id: {eq: ${id}}}}) {
      results {
        styleNumber
        id
      }
      totalCount
    }
  }`;
  const variables = { searchText, id };

  const data = await makeGraphQLRequest(query, variables);
  if (data[0]) {
    const result = [data[0], data[1]?.allStyleNumber?.results];
    return result;
  } else {
    return data;
  }
};

const getSNsfromPO = async (id) => {
  const query = `{
    allStyleNumber(where: {pos: {id: {eq: ${id}}}}) {
      results {
        id
        styleNumber
      }
    }
  }`;
  const variables = { id };
  const data = await makeGraphQLRequest(query, variables);
  return data?.allStyleNumber?.results || [];
};

export {
  getBookingDetail,
  getShipmentDetail,
  addPurchaseOrder,
  addStyleNumber,
  updateStyleNumber,
  updatePurchaseOrder,
  searchPOs,
  quickAddPOs,
  searchSNs,
  getSNsfromPO,
  checkPurchaseOrderExistence,
  checkStyleNumberExistence,
};
