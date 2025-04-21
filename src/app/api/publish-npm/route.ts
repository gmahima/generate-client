import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execPromise = promisify(exec);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    // Get the files and token from the form data
    const packageJsonFile = formData.get('package.json') as File;
    const indexJsFile = formData.get('index.js') as File;
    
    // Instead of getting the token from formData, get it from the environment
    // This is safer than sending it from the client
    const npmToken = process.env.NPM_PUBLISH_TOKEN;
    
    if (!packageJsonFile || !indexJsFile || !npmToken) {
      return NextResponse.json(
        { 
          message: !npmToken 
            ? 'NPM_PUBLISH_TOKEN is not configured in the server environment' 
            : 'Missing required files'
        },
        { status: 400 }
      );
    }

    // Create a temporary directory for the package
    const tempDir = path.join(os.tmpdir(), `npm-publish-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      // Write the files to the temp directory
      const packageJsonContent = await packageJsonFile.text();
      const indexJsContent = await indexJsFile.text();
      
      await fs.promises.writeFile(path.join(tempDir, 'package.json'), packageJsonContent);
      await fs.promises.writeFile(path.join(tempDir, 'index.js'), indexJsContent);
      
      // Create .npmrc file with the auth token
      const npmrcContent = `//registry.npmjs.org/:_authToken=${npmToken}`;
      await fs.promises.writeFile(path.join(tempDir, '.npmrc'), npmrcContent);
      
      // Run npm publish
      const { stdout, stderr } = await execPromise('npm publish', { cwd: tempDir });
      
      if (stderr && !stderr.includes('npm notice')) {
        throw new Error(stderr);
      }
      
      return NextResponse.json({
        message: 'Package published successfully',
        details: stdout
      });
    } finally {
      // Clean up the temporary directory
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }
  } catch (error) {
    console.error('Error publishing npm package:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to publish package' },
      { status: 500 }
    );
  }
} 