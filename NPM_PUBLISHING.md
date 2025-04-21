# NPM Package Publishing

This document describes how to set up and use the npm package publishing feature.

## Setup

To enable npm package publishing functionality, you need to set up your npm token:

1. Create an npm authentication token with publishing rights:
   ```bash
   npm login
   ```
   
   Then retrieve your token:
   ```bash
   cat ~/.npmrc
   ```
   
   Look for a line like `//registry.npmjs.org/:_authToken=YOUR_TOKEN_HERE`

2. Add the token to your environment variables:
   
   Create or update the `.env.local` file in your project root with:
   ```
   NPM_PUBLISH_TOKEN=your_token_here
   ```

3. Restart your development server:
   ```bash
   npm run dev
   ```

## Using the Publishing Feature

1. Generate a client by uploading an OpenAPI specification or opening an existing one
2. Once the client is generated, click the "Publish to npm" button that appears below the generated code
3. Fill in the package details:
   - **Package Name**: The npm package name (must be unique on npm)
   - **Version**: Following semver format (e.g., 1.0.0)
   - **Description**: Optional description of your API client
   - **Author**: Optional author information

4. Click "Publish" to publish the package to npm

## Implementation Details

The npm publishing process works as follows:

1. The client prepares a package.json file based on the user's input
2. The client code and package.json are sent to the server API endpoint
3. The server creates a temporary directory and writes the files
4. The server adds an .npmrc file with the npm token from environment variables
5. The server executes `npm publish` in the temporary directory
6. After publishing, the temporary directory is deleted

## Security Considerations

- The npm token is stored only on the server as an environment variable
- The token is never exposed to the client
- The package files are temporarily stored on the server during the publishing process
- All temporary files are cleaned up after publishing completes

## Troubleshooting

If you encounter issues with publishing:

1. Verify that your npm token is valid and has publishing rights
2. Ensure the package name is unique on npm
3. Check that the version follows semver format and is not already published
4. Check the server logs for any errors during the publishing process 