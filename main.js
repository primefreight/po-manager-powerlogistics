import {
    checkPurchaseOrderExistence,
    addPurchaseOrder,
    checkStyleNumberExistence,
    addStyleNumber,
    updatePurchaseOrder,
    updateStyleNumber,
  } from "./api.service.js";
  
  /**
   * Process a single shipment record using the combined field format.
   *
   * The logic is:
   *   1. Split the string by commas.
   *   2. For each token:
   *        - If it contains a hyphen, split into PO and its first style number,
   *          and mark that PO as the current one.
   *        - If it doesn't contain a hyphen, append the style number to the current PO.
   *   3. For each unique PO, check if it exists using checkPurchaseOrderExistence.
   *      - If it exists, log that the record was found and use it.
   *      - If it doesn't exist, log that we are adding a new record and call addPurchaseOrder.
   *   4. For each style number of that PO, check (or create) it using checkStyleNumberExistence/addStyleNumber.
   *   5. Build two payloads:
   *        • One with key "selectedPOs" for updating purchase orders.
   *        • One with key "purchaseOrder" for updating style numbers.
   *   6. Call both updatePurchaseOrder and updateStyleNumber for the shipment.
   *   7. If a booking_id is provided in the record, build similar payloads (with type "booking")
   *      and update the booking as well.
   */
  async function processRecord(record) {
    // Log the entire record to verify its structure.
    console.log("Processing record:", record);
  
    const shipmentID = record.shipmentID;
    const shipperId = parseInt(record.shipper_id, 10);
    const customerId = parseInt(record.customer_id, 10);
  
    // Build mapping: { PO: [style numbers] }
    const poMap = {};
    let currentPO = null;
  
    if (record.purchase_orders_and_styles) {
      const tokens = record.purchase_orders_and_styles
        .split(",")
        .map((token) => token.trim());
      for (const token of tokens) {
        if (token.includes("-")) {
          // Token format: "PO - SN"
          const [poRaw, snRaw] = token.split("-").map((str) => str.trim());
          if (poRaw && snRaw) {
            currentPO = poRaw;
            if (!poMap[currentPO]) {
              poMap[currentPO] = [];
            }
            poMap[currentPO].push(snRaw);
          }
        } else if (token) {
          // Token without hyphen: add to the most recent PO.
          if (currentPO) {
            poMap[currentPO].push(token);
          } else {
            console.error(`Token "${token}" encountered without a preceding PO. Skipping.`);
          }
        }
      }
    } else {
      console.error("Input record does not have the 'purchase_orders_and_styles' field.");
      return;
    }
  
    if (Object.keys(poMap).length === 0) {
      console.error("No purchase orders found in the input.");
      return;
    }
  
    // Process each purchase order.
    const processedPOs = [];
    for (const po of Object.keys(poMap)) {
      let poRecord = null;
      try {
        console.log(`Checking existence for PO "${po}" with shipper ID ${shipperId} and customer ID ${customerId}`);
        // Check whether the PO exists using order number, shipperId, and customerId.
        const result = await checkPurchaseOrderExistence(po, shipperId, customerId);
        if (result[0] && result[1]?.totalCount > 0) {
          // PO exists.
          poRecord = {
            id: result[1].results[0].id,
            orderNumber: result[1].results[0].orderNumbers,
            styleNumbers: [] // Will be filled next.
          };
          console.log(`PO "${po}" found in database (ID: ${poRecord.id}). Will update this record.`);
        } else {
          // PO doesn't exist; create it.
          console.log(`PO "${po}" not found in database. Calling addPurchaseOrder to create new record.`);
          const addResult = await addPurchaseOrder({
            type: "shipment",
            id: shipmentID,
            orderNumber: po
          });
          if (addResult[0]) {
            poRecord = {
              id: addResult[1],
              orderNumber: po,
              styleNumbers: []
            };
            console.log(`PO "${po}" successfully added (new ID: ${poRecord.id}).`);
          } else {
            console.error(`Error adding purchase order "${po}": ${addResult[1]}`);
            continue;
          }
        }
      } catch (err) {
        console.error(`Error processing purchase order "${po}":`, err);
        continue;
      }
    
      // Remove duplicate style numbers for this PO.
      const uniqueSNs = Array.from(new Set(poMap[po]));
      const processedSNs = [];
      for (const sn of uniqueSNs) {
        try {
          console.log(`Checking existence for style number "${sn}" for PO "${poRecord.orderNumber}" and shipment ${shipmentID}`);
          const snResult = await checkStyleNumberExistence(sn, poRecord.orderNumber, shipmentID);
          if (snResult[0] && snResult[1] && snResult[1].totalCount > 0) {
            console.log(`Style number "${sn}" found (ID: ${snResult[1].results[0].id}).`);
            processedSNs.push({
              id: snResult[1].results[0].id,
              styleNumber: snResult[1].results[0].styleNumber
            });
          } else {
            console.log(`Style number "${sn}" not found. Calling addStyleNumber to create it.`);
            const addSNResult = await addStyleNumber({
              styleNumber: sn,
              poId: poRecord.id,
              type: "shipment",
              id: shipmentID
            });
            if (addSNResult[0]) {
              console.log(`Style number "${sn}" successfully added (new ID: ${addSNResult[1]}).`);
              processedSNs.push({
                id: addSNResult[1],
                styleNumber: sn
              });
            } else {
              console.error(`Error adding style number "${sn}": ${addSNResult[1]}`);
            }
          }
        } catch (err) {
          console.error(`Error processing style number "${sn}":`, err);
        }
      }
      poRecord.styleNumbers = processedSNs;
      processedPOs.push(poRecord);
    }
    
    // Build payload for updating purchase orders for shipment.
    const finalPOPayload = {
      type: "shipment",
      id: shipmentID,
      selectedPOs: processedPOs.map(po => ({
        id: po.id,
        selectedSN: po.styleNumbers.map(sn => ({ id: sn.id }))
      }))
    };
    
    // Build payload for updating style numbers for shipment.
    const finalSNPayload = {
      type: "shipment",
      id: shipmentID,
      purchaseOrder: processedPOs.map(po => ({
        id: po.id,
        selectedSN: po.styleNumbers.map(sn => ({ id: sn.id }))
      }))
    };
    
    console.log("Final payload to update shipment purchase orders:", JSON.stringify(finalPOPayload, null, 2));
    console.log("Final payload to update shipment style numbers:", JSON.stringify(finalSNPayload, null, 2));
    
    // Call the endpoint to update purchase orders for shipment.
    try {
      const poUpdateResult = await updatePurchaseOrder(finalPOPayload);
      if (poUpdateResult[0]) {
        console.log(`Update of purchase orders successful for shipment ${shipmentID}`);
      } else {
        console.error(`Update of purchase orders failed for shipment ${shipmentID}: ${poUpdateResult[1]}`);
      }
    } catch (err) {
      console.error(`Error updating purchase orders for shipment ${shipmentID}:`, err);
    }
    
    // Call the endpoint to update style numbers for shipment.
    try {
      const snUpdateResult = await updateStyleNumber(finalSNPayload);
      if (snUpdateResult[0]) {
        console.log(`Update of style numbers successful for shipment ${shipmentID}`);
      } else {
        console.error(`Update of style numbers failed for shipment ${shipmentID}: ${snUpdateResult[1]}`);
      }
    } catch (err) {
      console.error(`Error updating style numbers for shipment ${shipmentID}:`, err);
    }
    
    // --- Additional: Update the booking record if booking_id is provided ---
    if (record.booking_id) {
      const bookingID = record.booking_id;
      console.log(`Booking record detected with booking_id ${bookingID}. Preparing booking update payloads...`);
      
      // Build payload for updating purchase orders for booking.
      const finalBookingPOPayload = {
        type: "booking",
        id: bookingID,
        selectedPOs: processedPOs.map(po => ({
          id: po.id,
          selectedSN: po.styleNumbers.map(sn => ({ id: sn.id }))
        }))
      };
      
      // Build payload for updating style numbers for booking.
      const finalBookingSNPayload = {
        type: "booking",
        id: bookingID,
        purchaseOrder: processedPOs.map(po => ({
          id: po.id,
          selectedSN: po.styleNumbers.map(sn => ({ id: sn.id }))
        }))
      };
      
      console.log("Final payload to update booking purchase orders:", JSON.stringify(finalBookingPOPayload, null, 2));
      console.log("Final payload to update booking style numbers:", JSON.stringify(finalBookingSNPayload, null, 2));
      
      // Call the endpoint to update purchase orders for booking.
      try {
        const bookingPOUpdateResult = await updatePurchaseOrder(finalBookingPOPayload);
        if (bookingPOUpdateResult[0]) {
          console.log(`Update of purchase orders successful for booking ${bookingID}`);
        } else {
          console.error(`Update of purchase orders failed for booking ${bookingID}: ${bookingPOUpdateResult[1]}`);
        }
      } catch (err) {
        console.error(`Error updating purchase orders for booking ${bookingID}:`, err);
      }
      
      // Call the endpoint to update style numbers for booking.
      try {
        const bookingSNUpdateResult = await updateStyleNumber(finalBookingSNPayload);
        if (bookingSNUpdateResult[0]) {
          console.log(`Update of style numbers successful for booking ${bookingID}`);
        } else {
          console.error(`Update of style numbers failed for booking ${bookingID}: ${bookingSNUpdateResult[1]}`);
        }
      } catch (err) {
        console.error(`Error updating style numbers for booking ${bookingID}:`, err);
      }
    }
  }
    
  // Export the processPayloads function so it can be used in the webhook server.
  export async function processPayloads(payloads) {
    for (const record of payloads) {
      await processRecord(record);
    }
    console.log("Processing complete.");
  }
  