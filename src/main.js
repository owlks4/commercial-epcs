import './style.css'
import 'leaflet'
import "leaflet-providers";
import { ZipReader, BlobReader, TextWriter} from '@zip.js/zip.js';
import { parse } from 'papaparse';


let BOUNDS = [[52.470929538389235, -1.8681315185627474],[52.445207838077096, -1.806846604153346]];
var map = L.map('map').setView([(BOUNDS[0][0] + BOUNDS[1][0]) / 2, (BOUNDS[0][1] + BOUNDS[1][1]) / 2]).fitBounds(BOUNDS);

L.tileLayer.provider("OpenStreetMap.Mapnik").addTo(map);

let UPRNLookup = {};
let certificates = null;
let columns = null;
let recommendations = null;
let schema = null;


tryLoadUPRNLookup();

async function tryLoadUPRNLookup(){
    const url = "./UPRNlookup.csv";
    try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Response status: ${response.status}`);
        }
        console.log("Loading UPRN lookup...")
        const csv = parse(await response.text(),{header:true});
        csv.data.forEach(item => {
            if (item.longitude < BOUNDS[0][1] || item.longitude > BOUNDS[1][1]){
              return;
            }
            if (item.latitude > BOUNDS[0][0] || item.latitude > BOUNDS[1][0]){
              return;
            }
            UPRNLookup[item.uprn] = [item.latitude, item.longitude];
        })
        console.log("UPRN lookup loaded.")
      } catch (error) {
        console.error(error.message);
      }
    await tryLoadEmbeddedZip();
}

async function tryLoadEmbeddedZip() {
    const url = "./epc.zip";
    console.log("Trying to load embedded zip...")
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }
      const zipFileReader = new BlobReader(await response.blob());
      const zipReader = new ZipReader(zipFileReader);
      const entries = await zipReader.getEntries();

      let NUM_FILES_FOR_COMPLETE_READ = 4;
      let numFilesProcessed = 0;

      entries.forEach(async entry => {
        const textWriter = new TextWriter();
        switch (entry.filename){
            case "certificates.csv":
                certificates = parse(await entry.getData(textWriter), {header:true});
            break;
            case "columns.csv":
                columns = parse(await entry.getData(textWriter), {header:true});
            break;
            case "recommendations.csv":
                recommendations = parse(await entry.getData(textWriter), {header:true}); //the LMK keys seem to be in order, so you could use binarysearch to get an answer pretty quickly from this
            break;
            case "schema.json":
                schema = JSON.parse(await entry.getData(textWriter));
            break;
            default:
            return;
        }
        numFilesProcessed++;
        if (numFilesProcessed == NUM_FILES_FOR_COMPLETE_READ){
            console.log("Embedded zip loaded")
            displayDatapointsOnMap();
        }
      });
      await zipReader.close();
    } catch (error) {
      console.error(error.message);
    }
  }

  function displayDatapointsOnMap(){
    let UPRNkeys = Object.keys(UPRNLookup);
    let certsLength = certificates.data.length;

        certificates.data.forEach((cert,index) => {
            if (!UPRNkeys.includes(cert.UPRN)){
                return;
            }
            if (index == parseInt(Math.floor(certsLength / 4))){
                console.log("25% complete")
            } else if (index == parseInt(Math.floor(certsLength / 2))){
                console.log("50% complete. We won't bother listing 75...")
            }
            L.circleMarker(UPRNLookup[cert.UPRN], {
                radius : 5,
                fillColor: '#0000ff',                
                fillOpacity: 0.9,
                opacity: 0,
              }).addTo(map);
        });

        console.log("Done");
  }