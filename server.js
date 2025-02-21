// server.js
import dotenv from 'dotenv';
dotenv.config();

import { Actor } from 'apify';
import express from 'express';
import bodyParser from 'body-parser';
import { processPayloads } from './main.js'; // Ensure this path is correct

// Determine mode based on the environment variable.
const isActorMode = process.env.APIFY_ACTOR_RUN;

if (isActorMode) {
    // Apify Actor Mode
    await Actor.init();

    // Retrieve input provided to the actor.
    const input = await Actor.getInput();
    // If input is already an array, use it directly.
    const payloads = Array.isArray(input) ? input : (input.payloads || null);

    if (!payloads || !Array.isArray(payloads)) {
        throw new Error('Input must be an array of payload objects or contain a "payloads" array');
    }

    console.log('Received input from Apify:', JSON.stringify(payloads, null, 2));

    // Process the payloads.
    await processPayloads(payloads);
    console.log('Processing complete.');

    // Optionally, save output.
    await Actor.setValue('OUTPUT', { result: 'Processing complete.' });
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
            if (!payloads || !Array.isArray(payloads)) {
                res.status(400).send({ error: 'Payload must be an array of payload objects' });
                return;
            }
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
}
