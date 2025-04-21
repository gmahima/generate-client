'use client';

import React, { useState } from 'react';

// Define types for OpenAPI objects
interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, PathItem>;
}

interface PathItem {
  [method: string]: OperationObject;
}

interface OperationObject {
  summary?: string;
  description?: string;
  parameters?: ParameterObject[];
  responses?: Record<string, ResponseObject>;
}

interface ParameterObject {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
  type?: string;
}

interface SchemaObject {
  type?: string;
  format?: string;
}

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: SchemaObject }>;
}

interface SimpleApiPreviewProps {
  spec?: OpenAPISpec;
  className?: string;
}

const SimpleApiPreview: React.FC<SimpleApiPreviewProps> = ({ spec, className = '' }) => {
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  
  if (!spec) {
    return (
      <div className={`bg-red-50 text-red-700 p-4 rounded-md ${className}`}>
        No API specification provided
      </div>
    );
  }
  
  // Get basic info from the spec
  const apiTitle = spec.info?.title || 'API Documentation';
  const apiVersion = spec.info?.version || '';
  const apiDescription = spec.info?.description || '';
  
  // Get all paths from the spec
  const paths = Object.entries(spec.paths || {});
  
  const togglePath = (path: string) => {
    if (expandedPath === path) {
      setExpandedPath(null);
    } else {
      setExpandedPath(path);
    }
  };
  
  // Get method badge color
  const getMethodColor = (method: string) => {
    switch (method.toLowerCase()) {
      case 'get':
        return 'bg-blue-100 text-blue-800';
      case 'post':
        return 'bg-green-100 text-green-800';
      case 'put':
        return 'bg-amber-100 text-amber-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'patch':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-blue-50 p-6 border-b">
        <h1 className="text-2xl font-bold text-gray-900">{apiTitle}</h1>
        {apiVersion && (
          <div className="mt-1 text-sm text-gray-500">Version: {apiVersion}</div>
        )}
        {apiDescription && (
          <div className="mt-4 text-gray-700 whitespace-pre-line">{apiDescription}</div>
        )}
      </div>
      
      {/* Endpoints */}
      <div className="divide-y">
        {paths.length > 0 ? (
          paths.map(([path, pathObj]) => {
            const methods = Object.entries(pathObj as PathItem);
            return (
              <div key={path} className="hover:bg-gray-50">
                <div 
                  className="p-4 cursor-pointer"
                  onClick={() => togglePath(path)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm font-medium text-gray-700">{path}</div>
                    <div className="flex space-x-2">
                      {methods.map(([method]) => (
                        <span 
                          key={method} 
                          className={`px-2 py-1 rounded text-xs font-medium uppercase ${getMethodColor(method)}`}
                        >
                          {method}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                {expandedPath === path && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {methods.map(([method, methodObj]) => {
                      const summary = methodObj.summary || '';
                      const description = methodObj.description || '';
                      const parameters = methodObj.parameters || [];
                      const responses = methodObj.responses || {};
                      
                      return (
                        <div key={method} className="py-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${getMethodColor(method)}`}>
                              {method}
                            </span>
                            <span className="font-mono text-sm">{path}</span>
                          </div>
                          
                          {summary && <div className="text-sm font-medium mb-1">{summary}</div>}
                          {description && <div className="text-sm text-gray-600 mb-4">{description}</div>}
                          
                          {/* Parameters */}
                          {parameters.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-semibold mb-2">Parameters</h4>
                              <div className="bg-gray-50 rounded overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">In</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Required</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {parameters.map((param, idx) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 text-sm font-mono">{param.name}</td>
                                        <td className="px-4 py-2 text-sm">{param.in}</td>
                                        <td className="px-4 py-2 text-sm">{param.schema?.type || param.type || '-'}</td>
                                        <td className="px-4 py-2 text-sm">
                                          {param.required ? 
                                            <span className="text-red-600">Yes</span> : 
                                            <span className="text-gray-500">No</span>}
                                        </td>
                                        <td className="px-4 py-2 text-sm">{param.description || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          
                          {/* Responses */}
                          {Object.keys(responses).length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-semibold mb-2">Responses</h4>
                              <div className="space-y-2">
                                {Object.entries(responses).map(([code, response]) => (
                                  <div key={code} className="rounded border border-gray-200">
                                    <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-gray-50">
                                      <span className={`px-2 py-1 rounded text-xs font-medium mr-2 ${
                                        code.startsWith('2') ? 'bg-green-100 text-green-800' : 
                                        code.startsWith('4') ? 'bg-red-100 text-red-800' : 
                                        code.startsWith('3') ? 'bg-yellow-100 text-yellow-800' : 
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {code}
                                      </span>
                                      <span className="text-sm">{response.description || '-'}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-6 text-center text-gray-500">
            No endpoints defined in this API specification
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleApiPreview; 