// server.js
import dotenv from 'dotenv';
dotenv.config();

import { Actor } from 'apify';
import express from 'express';
import bodyParser from 'body-parser';
import { processPayloads } from './main.js'; // Ensure this path is correct

// Determine mode based on the environment variable.
const isActorMode = process.env.APIFY_ACTOR_RUN;

// Apify Actor Mode: Initialize and process input from Apify.
if (isActorMode) {
    // Initialize the Actor.
    await Actor.init();

    // Retrieve input provided to the actor.
    const input = await Actor.getInput();
    if (!input || !input.payloads || !Array.isArray(input.payloads)) {
        throw new Error('Input must contain a "payloads" array');
    }
    console.log('Received input from Apify:', JSON.stringify(input, null, 2));

    // Process the payloads.
    await processPayloads(input.payloads);
    console.log('Processing complete.');

    // Optionally, save output.
    await Actor.setValue('OUTPUT', { result: 'Processing complete.' });

    // Exit the actor.
    await Actor.exit();
} else {
    // Offline Mode: Start an Express server.
    const app = express();
    const port = process.env.PORT || 3000;

    // Use body-parser to parse JSON bodies.
    app.use(bodyParser.json());

    // Define a webhook endpoint.
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

    // Start the server.
    app.listen(port, () => {
        console.log(`Webhook listening on port ${port}`);
    });
}
