// server.js
import dotenv from 'dotenv';
dotenv.config();

import { processPayloads } from './main.js'; // Ensure this path is correct

if (process.env.APIFY_ACTOR_RUN) {
    // Apify actor mode: dynamically import Apify
    import('apify')
        .then(({ default: Apify }) => {
            Apify.main(async () => {
                // Retrieve the input provided by Apify
                const input = await Apify.getInput();
                if (!input || !input.payloads || !Array.isArray(input.payloads)) {
                    throw new Error('Input must contain a "payloads" array');
                }
                console.log('Received input from Apify:', JSON.stringify(input, null, 2));

                // Process the payloads using your processing logic
                await processPayloads(input.payloads);
                console.log('Processing complete.');
            });
        })
        .catch(err => {
            console.error('Failed to load Apify module:', err);
        });
} else {
    // Offline mode: dynamically import Express and body-parser
    Promise.all([import('express'), import('body-parser')])
        .then(([expressModule, bodyParserModule]) => {
            const express = expressModule.default;
            const bodyParser = bodyParserModule.default;

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
        })
        .catch(err => {
            console.error('Failed to load Express or body-parser module:', err);
        });
}
