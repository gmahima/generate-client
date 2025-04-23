import React, { useEffect, useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

type SwaggerUIWrapperProps = {
  spec?: object;
  url?: string;
};

const SwaggerUIWrapper: React.FC<SwaggerUIWrapperProps> = ({ spec, url }) => {
  // Configure Swagger UI with settings that avoid using the deprecated lifecycle methods
  const [key, setKey] = useState(0);

  useEffect(() => {
    // Force a re-render when spec or url changes to avoid UNSAFE_componentWillReceiveProps
    setKey(prev => prev + 1);
  }, [spec, url]);

  return (
    <div className="swagger-ui-wrapper">
      <SwaggerUI 
        key={key}
        spec={spec} 
        url={url}
        docExpansion="list"
        defaultModelsExpandDepth={-1} // Hide models by default
        defaultModelExpandDepth={-1}
      />
    </div>
  );
};

export default SwaggerUIWrapper; 