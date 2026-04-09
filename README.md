# esign-platform

A web-based electronic signature collection platform built with Node.js and MongoDB.

## Live Links
- **Signer page:** https://esign-platform.onrender.com
- **Admin portal:** https://esign-platform.onrender.com/admin

## Features
- Users can read a document and sign electronically with mouse or touch
- Admin portal to view all signatures
- Export signatures to Excel or CSV
- Print all signatures with actual signature images
- Upload a PDF or link a Google Drive document
- Password protected admin portal
- Permanent storage with MongoDB Atlas

## Tech Stack
- Node.js + Express (backend)
- MongoDB Atlas (database)
- HTML, CSS, JavaScript (frontend)
- Deployed on Railway

## Local Setup
1. Clone the repo
2. Run `npm install`
3. Add your `MONGODB_URI` in a `.env` file
4. Run `node server.js`
5. Open `http://localhost:3000`

## Environment Variables
| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `ADMIN_USER` | Admin portal username |
| `ADMIN_PASS` | Admin portal password |