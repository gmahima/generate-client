// supabase/functions/generate-client/index.ts
// @ts-expect-error: Deno module imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno module imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// GitHub API token with repo scope permissions
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
// Your GitHub username or organization
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER") || "";
// The repository name containing your workflow
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") || "npm-publisher";

console.log("[STARTUP] Function loaded with environment variables:");
console.log(`  SUPABASE_URL: ${SUPABASE_URL ? "✓ Set" : "✗ Missing"}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY ? "✓ Set" : "✗ Missing"}`);
console.log(`  GEMINI_API_KEY: ${GEMINI_API_KEY ? "✓ Set" : "✗ Missing"}`);
console.log(`  GITHUB_TOKEN: ${GITHUB_TOKEN ? "✓ Set" : "✗ Missing"}`);
console.log(`  GITHUB_OWNER: ${GITHUB_OWNER ? `✓ Set (${GITHUB_OWNER})` : "✗ Missing"}`);
console.log(`  GITHUB_REPO: ${GITHUB_REPO ? `✓ Set (${GITHUB_REPO})` : "✗ Missing"}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  try {
    console.log("==================== FUNCTION INVOKED ====================");
    console.log("Function started, parsing payload...");
    // Parse the webhook payload
    const payload = await req.json();
    
    // Handle both direct calls and webhook format
    let spec_id, project_id, version, file_content;
    
    if (payload.type && payload.record) {
      // This is a webhook payload
      console.log("Webhook format detected, extracting data from record");
      const record = payload.record;
      spec_id = record.id;
      project_id = record.project_id;
      version = record.version;
      file_content = record.file_content;
    } else {
      // Direct call format
      console.log("Direct call format detected");
      ({ spec_id, project_id, version, file_content } = payload);
    }
    
    console.log(`Processing: Project ID: ${project_id}, Spec ID: ${spec_id}, Version: ${version}`);
    console.log(`File content length: ${file_content ? file_content.length : 0} characters`);
    
    if (!spec_id || !project_id || !file_content) {
      console.error("Missing required fields:", { spec_id, project_id, file_content: Boolean(file_content) });
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Get the previous version's client (if exists)
    console.log("Fetching previous client versions...");
    const { data: previousClients, error: prevError } = await supabase
      .from("generated_clients")
      .select("client_code")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (prevError) {
      console.error("Error fetching previous clients:", prevError);
    }
    
    console.log(`Previous clients found: ${previousClients?.length || 0}`);
    
    // Generate the prompt for AI
    console.log("Preparing AI prompt...");
    let prompt;
    
    if (previousClients && previousClients.length > 0) {
      // If we have a previous client, use a diff-based prompt
      console.log("Using diff-based prompt with previous client code");
      prompt = `Generate a JavaScript client library for the following OpenAPI specification.
      The client should provide functions for all the endpoints defined in the spec.

      I have a previous version of the client code and need to update it based on the new API specification.
      
      Here's the previous client code:
      ${previousClients[0].client_code}
      
      Here's the new API specification:
      ${file_content}
      
      Please focus on updating only the parts affected by the changes in the spec.
      Format the output as JavaScript code only, with detailed comments for each function.
      
      Make sure to include the version "${version}" in a comment at the top of the file.`;
    } else {
      // Regular prompt for first-time generation
      console.log("Using standard prompt for first-time generation");
      prompt = `Generate a JavaScript client library for the following OpenAPI specification. 
      The client should provide functions for all the endpoints defined in the spec.
      Format the output as JavaScript code only, with detailed comments for each function.
      
      Make sure to include the version "${version}" in a comment at the top of the file.
      
      Here's the OpenAPI specification:
      ${file_content}`;
    }
    
    console.log("Calling Gemini API...");
    
    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error: ${response.status}`, errorText);
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }
    
    console.log("Gemini API response received successfully");
    
    const data = await response.json();
    
    // Extract the generated code
    let clientCode = "";
    if (data.candidates && data.candidates[0]?.content?.parts?.length > 0) {
      const generatedText = data.candidates[0].content.parts[0].text;
      // Extract only the code part if there's any explanation
      const codeMatch = generatedText.match(/\`\`\`(?:javascript|js)([\s\S]*?)\`\`\`/);
      clientCode = codeMatch ? codeMatch[1].trim() : generatedText;
      console.log(`Client code successfully extracted, length: ${clientCode.length} characters`);
      console.log("First 100 characters of code:", clientCode.substring(0, 100));
    } else {
      console.error("Invalid response format from Gemini API:", JSON.stringify(data, null, 2).substring(0, 500));
      throw new Error("Invalid response format from Gemini API");
    }
    
    console.log(`Client code generated (${clientCode.length} bytes), saving to database...`);
    
    // Save the generated client to the generated_clients table
    console.log("Inserting client code into generated_clients table...");
    const { data: newClient, error: insertError } = await supabase
      .from("generated_clients")
      .insert({
        project_id,
        spec_version_id: spec_id,
        client_code: clientCode
      })
      .select()
      .single();
    
    if (insertError) {
      console.error("Error inserting generated client:", insertError);
      throw insertError;
    }
    
    console.log(`Client saved to database with ID: ${newClient.id}`);
    console.log("Updating spec_version to mark client as ready...");
    
    // Update the spec_version to mark it as ready for publishing
    const { error: updateError } = await supabase
      .from("spec_versions")
      .update({ 
        client_ready: true 
      })
      .eq("id", spec_id);
    
    if (updateError) {
      console.error("Error updating spec_version:", updateError);
      throw updateError;
    }
    
    console.log("Client code saved, now triggering GitHub Actions workflow...");
    
    try {
      // Get the NPM config for this project
      console.log(`Fetching NPM config for project ${project_id}...`);
      const { data: npmConfig, error: configError } = await supabase
        .from("npm_configs")
        .select("*")
        .eq("project_id", project_id)
        .single();
      
      if (configError || !npmConfig) {
        console.error("NPM config error:", configError);
        throw new Error(`NPM configuration not found for project ${project_id}: ${configError?.message || "No data returned"}`);
      }
      
      console.log(`NPM config found: Package name: ${npmConfig.package_name}`);
      
      // Create package.json data
      const packageJson = {
        name: npmConfig.package_name,
        version: version,
        description: npmConfig.description || "Generated API client",
        main: "index.js",
        author: npmConfig.author || "",
        license: "MIT"
      };
      
      console.log("Package.json created:", JSON.stringify(packageJson, null, 2));
      console.log(`Triggering GitHub workflow on ${GITHUB_OWNER}/${GITHUB_REPO}...`);
      
      // Trigger the GitHub Actions workflow using repository_dispatch event
      const githubResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
        {
          method: "POST",
          headers: {
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28"
          },
          body: JSON.stringify({
            event_type: "publish-npm",
            client_payload: {
              packageJson: JSON.stringify(packageJson),
              clientCode: clientCode,
              specId: spec_id,
              projectId: project_id
            }
          })
        }
      );
      
      if (!githubResponse.ok) {
        let errorText = "";
        try {
          errorText = await githubResponse.text();
        } catch (_) {
          errorText = "Could not read error response";
        }
        console.error(`Error triggering GitHub workflow: ${githubResponse.status}`, errorText);
        throw new Error(`Failed to trigger GitHub workflow: ${githubResponse.status} ${errorText}`);
      }
      
      console.log("GitHub Actions workflow triggered successfully");
      
      // Update the spec version as published (will be actually published by the GitHub workflow)
      console.log(`Updating spec_version ${spec_id} as published...`);
      const { error: publishUpdateError } = await supabase
        .from("spec_versions")
        .update({ 
          is_published: true,
          published_at: new Date().toISOString()
        })
        .eq("id", spec_id);
        
      if (publishUpdateError) {
        console.error("Error marking as published:", publishUpdateError);
      } else {
        console.log("Successfully marked spec_version as published");
      }
      
      console.log("Function completed successfully");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Client generated and publishing workflow triggered",
          client_id: newClient.id,
          spec_id: spec_id,
          package: {
            name: npmConfig.package_name,
            version: version
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (publishError) {
      console.error("Error triggering publishing workflow:", publishError);
      
      // Even if publishing fails, we return a success response for the client generation
      // but include the publishing error in the response
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Client generated successfully but publishing workflow failed",
          client_id: newClient.id,
          spec_id: spec_id,
          publish_error: publishError instanceof Error ? publishError.message : String(publishError)
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
  } catch (error) {
    console.error("Error processing request:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to generate client", 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});