# NPM Package Publishing Service

This Supabase Edge Function is responsible for publishing generated client code to NPM.

## Architecture

This is the second part of a two-step process:
1. The `generate-client` function generates client code using Gemini AI and stores it in the database
2. This `publish-client` function is triggered when client code is ready and handles NPM publishing

## Setup Options

Since Edge Functions cannot directly run npm commands, you'll need to set up an external service to handle the actual publishing. Here are some options:

### Option 1: GitHub Actions Webhook

1. Create a GitHub repository to host your publishing service
2. Create a GitHub Actions workflow that:
   - Receives webhook calls from this Edge Function
   - Creates package files from the data sent in the request
   - Uses the NPM token to publish the package
   - Reports back success/failure

### Option 2: Custom Server/Service

1. Set up a server (AWS Lambda, GCP Cloud Functions, etc.) that:
   - Provides an endpoint for the Edge Function to call
   - Has Node.js installed with npm capabilities
   - Can create temporary files and run npm commands
   - Uses the NPM token passed in the request

### Option 3: Direct NPM Registry API

For a more advanced approach, you can implement direct calls to the NPM Registry API:
- Create a tarball in memory (challenging but possible)
- Make authenticated PUT requests to the NPM Registry
- This eliminates the need for an external service but is much more complex to implement

## Configuration

1. Update the URL in the fetch call to point to your actual publishing service
2. Make sure your external service accepts the payload format used in this function
3. Set the `NPM_TOKEN` environment variable in your Supabase project

## Database Schema Requirements

- `spec_versions` table should have columns:
  - `client_code`: TEXT - The generated client code
  - `client_ready`: BOOLEAN - Flag indicating the code is ready for publishing
  - `is_published`: BOOLEAN - Flag indicating successful publishing
  - `published_at`: TIMESTAMP - When the package was published
  
- `npm_configs` table should have:
  - `package_name`: TEXT - NPM package name
  - `description`: TEXT - Package description
  - `author`: TEXT - Package author 