import express from 'express';
import bodyParser from 'body-parser';
import { processPayloads } from './main.js'; // Ensure this path is correct

const app = express();
const port = process.env.PORT || 3000;

// Use body-parser to parse JSON bodies
app.use(bodyParser.json());

// Define the webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const payloads = req.body;
    console.log('Webhook received payload:', JSON.stringify(payloads, null, 2));
    await processPayloads(payloads);
    res.status(200).send({ message: 'Payload processed successfully' });
  } catch (error) {
    console.error('Error processing payload:', error);
    res.status(500).send({ error: 'Processing error' });
  }
});

app.listen(port, () => {
  console.log(`Webhook listening on port ${port}`);
});
