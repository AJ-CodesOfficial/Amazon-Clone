import { buffer } from "micro"
import * as admin from 'firebase-admin'

const app = !admin.apps.length ? admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
}) : admin.app();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const endpointSecret = process.env.STRIPE_SIGNING_SECRET

const fullfillOrder = async (session) => {

    return app.firestore().collection('users').doc(session.metadata.email).collection('orders').doc(session.id).set({
        amount: session.amount_total / 100,
        amount_shipping: session.total_details.amount_shipping / 100,
        images: JSON.parse(session.metadata.images),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        console.log(`Success: Order ${session.id} has been added to the DB`)
    })
}


export default async (req, res) => {
    if (req.method === 'POST') {
        const requestBuffer = await buffer(req);
        const payload = requestBuffer.toString();
        const sig = req.headers["stripe-signature"];

        let event;

        try {
            event = stripe.webhooks.constructEvent(payload, sig, endpointSecret)
        } catch (error) {
            console.log(error)
            return res.status(400).send(`Webhook error: ${error.message}`)
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            return fullfillOrder(session).then(() => res.status(200)).catch((err) => res.status(400).send(`Webhook Error: ${err.message}`))
        }
    }
}

export const config = {
    api: {
        bodyParser: false,
        externalResolver: true
    }
}