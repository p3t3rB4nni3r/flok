import { useEffect, useState } from 'react';

const useConfig = () => {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8001/api/config')
      .then((response) => response.json())
      .then((data) => setConfig(data))
      .catch((error) => console.error('Error loading config:', error));
  }, []);

  return config;
};

export default useConfig;
