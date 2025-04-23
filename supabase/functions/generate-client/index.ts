// supabase/functions/generate-client/index.ts
// @ts-expect-error: Deno module imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno module imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error: Deno API
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
// @ts-expect-error: Deno API
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
// @ts-expect-error: Deno API
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  try {
    // Parse the webhook payload
    const payload = await req.json();
    
    // Handle both direct calls and webhook format
    let spec_id, project_id, version, file_content;
    
    if (payload.type && payload.record) {
      // This is a webhook payload
      const record = payload.record;
      spec_id = record.id;
      project_id = record.project_id;
      version = record.version;
      file_content = record.file_content;
    } else {
      // Direct call format
      ({ spec_id, project_id, version, file_content } = payload);
    }
    
    if (!spec_id || !project_id || !file_content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Get the previous version's client (if exists)
    const { data: previousClients } = await supabase
      .from("generated_clients")
      .select("client_code")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(1);
    
    // Generate the prompt for AI
    let prompt;
    
    if (previousClients && previousClients.length > 0) {
      // If we have a previous client, use a diff-based prompt
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
      prompt = `Generate a JavaScript client library for the following OpenAPI specification. 
      The client should provide functions for all the endpoints defined in the spec.
      Format the output as JavaScript code only, with detailed comments for each function.
      
      Make sure to include the version "${version}" in a comment at the top of the file.
      
      Here's the OpenAPI specification:
      ${file_content}`;
    }
    
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
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    // Extract the generated code
    let clientCode = "";
    if (data.candidates && data.candidates[0]?.content?.parts?.length > 0) {
      const generatedText = data.candidates[0].content.parts[0].text;
      // Extract only the code part if there's any explanation
      const codeMatch = generatedText.match(/\`\`\`(?:javascript|js)([\s\S]*?)\`\`\`/);
      clientCode = codeMatch ? codeMatch[1].trim() : generatedText;
    } else {
      throw new Error("Invalid response format from Gemini API");
    }
    
    // Save the generated client to the database
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
      throw insertError;
    }
    
    // Call the publish-npm function with the generated client details
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/publish-npm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          spec_id,
          project_id,
          version,
          client_id: newClient.id
        })
      });
    } catch (publishError) {
      console.error("Failed to trigger npm publishing:", publishError);
      // We continue anyway as the client generation was successful
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Client generated successfully",
        client_id: newClient.id
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Error generating client:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to generate client", 
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});