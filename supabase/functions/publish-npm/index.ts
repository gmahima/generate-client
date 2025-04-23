// supabase/functions/publish-npm/index.ts

// NOTE: TypeScript errors are expected in editor but will work in Deno

// @ts-expect-error: Deno module imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno module imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error: Deno API
const NPM_TOKEN = Deno.env.get("NPM_TOKEN") || "";
// @ts-expect-error: Deno API
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
// @ts-expect-error: Deno API
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  try {
    // Parse the request payload
    const { spec_id, project_id, version, client_id } = await req.json();
    
    if (!spec_id || !project_id || !version || !client_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Get the generated client code
    const { data: clientData, error: clientError } = await supabase
      .from("generated_clients")
      .select("client_code")
      .eq("id", client_id)
      .single();
    
    if (clientError || !clientData) {
      throw new Error(`Could not find client with ID ${client_id}: ${clientError?.message || "No data returned"}`);
    }
    
    // Get the NPM config for this project
    const { data: npmConfig, error: configError } = await supabase
      .from("npm_configs")
      .select("*")
      .eq("project_id", project_id)
      .single();
    
    if (configError || !npmConfig) {
      throw new Error(`NPM configuration not found for project ${project_id}: ${configError?.message || "No data returned"}`);
    }
    
    // Create package.json
    const packageJson = {
      name: npmConfig.package_name,
      version: version,
      description: npmConfig.description || "Generated API client",
      main: "index.js",
      author: npmConfig.author || "",
      license: "MIT"
    };
    
    // Create a temporary directory for the package
    // @ts-expect-error: Deno API
    const tempDir = await Deno.makeTempDir();
    
    try {
      // Write package.json
      // @ts-expect-error: Deno API
      await Deno.writeTextFile(
        `${tempDir}/package.json`, 
        JSON.stringify(packageJson, null, 2)
      );
      
      // Write index.js with the client code
      // @ts-expect-error: Deno API
      await Deno.writeTextFile(
        `${tempDir}/index.js`, 
        clientData.client_code
      );
      
      // Create .npmrc file with the token
      // @ts-expect-error: Deno API
      await Deno.writeTextFile(
        `${tempDir}/.npmrc`,
        `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`
      );
      
      // Run npm publish
      // @ts-expect-error: Deno API
      const publishCommand = new Deno.Command("npm", {
        args: ["publish", "--access=public"],
        cwd: tempDir,
      });
      
      const publishOutput = await publishCommand.output();
      
      if (!publishOutput.success) {
        const errorText = new TextDecoder().decode(publishOutput.stderr);
        throw new Error(`NPM publish error: ${errorText}`);
      }
      
      // Update the spec_version as published
      await supabase
        .from("spec_versions")
        .update({ is_published: true })
        .eq("id", spec_id);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Package published successfully",
          package: {
            name: npmConfig.package_name,
            version: version
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } finally {
      // Clean up temp directory
      try {
        // @ts-expect-error: Deno API
        await Deno.remove(tempDir, { recursive: true });
      } catch (cleanupError) {
        console.error("Error cleaning up temp directory:", cleanupError);
      }
    }
    
  } catch (error) {
    console.error("Error publishing npm package:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to publish npm package", 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});