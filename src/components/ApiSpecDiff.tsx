"use client";

import { useState, useEffect } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import yaml from 'js-yaml';
import { Button } from '@/components/ui/button';

interface ApiSpecDiffProps {
  oldSpec: string | null;
  newSpec: string | null;
  formatType?: 'json' | 'yaml';
}

const ApiSpecDiff = ({ oldSpec, newSpec, formatType: initialFormatType = 'json' }: ApiSpecDiffProps) => {
  const [oldFormatted, setOldFormatted] = useState<string>('');
  const [newFormatted, setNewFormatted] = useState<string>('');
  const [viewType, setViewType] = useState<'split' | 'unified'>('split');
  const [formatType, setFormatType] = useState<'json' | 'yaml'>(initialFormatType);

  useEffect(() => {
    if (oldSpec) {
      try {
        // Parse and format the old spec
        let parsedOld;
        try {
          parsedOld = JSON.parse(oldSpec);
        } catch {
          parsedOld = yaml.load(oldSpec);
        }
        
        setOldFormatted(
          formatType === 'json' 
            ? JSON.stringify(parsedOld, null, 2) 
            : yaml.dump(parsedOld)
        );
      } catch (error) {
        console.error('Error formatting old spec:', error);
        setOldFormatted(oldSpec || '');
      }
    }

    if (newSpec) {
      try {
        // Parse and format the new spec
        let parsedNew;
        try {
          parsedNew = JSON.parse(newSpec);
        } catch {
          parsedNew = yaml.load(newSpec);
        }
        
        setNewFormatted(
          formatType === 'json' 
            ? JSON.stringify(parsedNew, null, 2) 
            : yaml.dump(parsedNew)
        );
      } catch (error) {
        console.error('Error formatting new spec:', error);
        setNewFormatted(newSpec || '');
      }
    }
  }, [oldSpec, newSpec, formatType]);

  if (!oldSpec && !newSpec) {
    return <div className="p-4 bg-gray-100 rounded-lg">No specs to compare</div>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-100 p-3 border-b flex justify-between items-center">
        <h3 className="font-medium">API Specification Changes</h3>
        <div className="space-x-2">
          <Button 
            variant={viewType === 'split' ? "default" : "outline"} 
            size="sm"
            onClick={() => setViewType('split')}
          >
            Split View
          </Button>
          <Button 
            variant={viewType === 'unified' ? "default" : "outline"} 
            size="sm"
            onClick={() => setViewType('unified')}
          >
            Unified View
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setFormatType(formatType === 'json' ? 'yaml' : 'json')}
          >
            Switch to {formatType === 'json' ? 'YAML' : 'JSON'}
          </Button>
        </div>
      </div>
      
      <ReactDiffViewer
        oldValue={oldFormatted}
        newValue={newFormatted}
        splitView={viewType === 'split'}
        useDarkTheme={false}
        hideLineNumbers={false}
        styles={{
          contentText: {
            fontSize: '14px',
            lineHeight: '1.5',
            fontFamily: 'monospace',
          },
        }}
      />
    </div>
  );
};

export default ApiSpecDiff; 