// Public certificates from the installed official Node.js/Mozilla CA store.
// This stores no private keys and needs no network or account credentials.
import fs from 'node:fs';
import {rootCertificates} from 'node:tls';
import {X509Certificate} from 'node:crypto';
const roots=rootCertificates.flatMap(pem=>{
  const cert=new X509Certificate(pem);
  if(!/CN=(ISRG Root X[12]|GTS Root R[1-4])(?:\n|$)/.test(cert.subject))return [];
  if(!cert.ca || !cert.verify(cert.publicKey))throw new Error('Expected self-signed root CA');
  return [{pem,subject:cert.subject,fingerprint:cert.fingerprint256,validTo:cert.validTo}];
});
if(roots.length!==6)throw new Error(`Expected 6 CA roots, found ${roots.length}. Review the Node CA store before updating.`);
fs.mkdirSync('firmware/wokwi/certs',{recursive:true});
fs.writeFileSync('firmware/wokwi/certs/roots.pem',roots.map(r=>r.pem.trim()).join('\n')+'\n');
fs.writeFileSync('firmware/wokwi/certs/sources.json',JSON.stringify({source:`node:tls rootCertificates (${process.version}; Mozilla CA store)`,references:['https://letsencrypt.org/certificates/','https://pki.goog/repository/'],certificates:roots.map(r=>({subject:r.subject,fingerprint:r.fingerprint,validTo:r.validTo}))},null,2)+'\n');
console.log('Saved 6 public trust roots for Wokwi HTTPS.');
