import './style.css'
import 'leaflet'
import "leaflet/dist/leaflet.css"
import "leaflet-providers";
import { ZipReader, BlobReader, TextWriter, TextReader} from '@zip.js/zip.js';
import { parse } from 'papaparse';
import {spawnMapControls, mappableFactors} from "./mapControls.js";
import {setMapInUse, USE_MAP_FOR_RENDER, makeCircleMarker, setMapRenderVars, certificates, setCertificates, appendToCertificates, rerenderDatapoints} from "./mapDataRender.js";
import {epcRecCategories} from "./recFilterManager.js";

let BOUNDS = [[52.470929538389235, -1.8681315185627474],[52.445207838077096, -1.806846604153346]];
var map = L.map('map').setView([(BOUNDS[0][0] + BOUNDS[1][0]) / 2, (BOUNDS[0][1] + BOUNDS[1][1]) / 2]).fitBounds(BOUNDS);
L.tileLayer.provider("Esri.WorldStreetMap").addTo(map);
spawnMapControls(map);

setMapRenderVars(map);

let sourceZips = [];
let numberOfZipsToLoad = 0;
let numberOfZipsLoaded = 0;

let veil = document.getElementById("veil");
veil.onclick = (e)=>{
  if (e.target.id != "veil"){
    return;
  }

  let input = document.createElement("input");
  input.type = "file";
  input.accept = "application/zip";
  input.multiple = true;
  
  input.oninput = () => {
    sourceZips = input.files;
    numberOfZipsLoaded = 0;
    numberOfZipsToLoad = input.files.length;

    console.log("Received file input... "+input.files.length+" files")

    loadZipFileWithIndex(0);
  };
  input.click();
};

function loadZipFileWithIndex(index){
  let file = sourceZips[index];
  let reader = new FileReader();

  reader.onload = async function() {
    await tryLoadZipFromUrl(reader.result);
  };

  reader.readAsDataURL(file);
      
  reader.onerror = function() {
    console.log(reader.error);
  };
}

let UPRNLookup = {};
let columns = null;
let recommendations = null;
let schema = null;

const paybackTypes = {"short":0, "SHORT":0, "medium":1, "MEDIUM":1, "long":2, "LONG":2, "other":3, "OTHER":3};

async function tryLoadUPRNLookup(){
      try {
        const response = await fetch("./u");
        if (!response.ok) {
          throw new Error(`Response status: ${response.status}`);
        }

        const csv = parse(await response.text(), {header:true, transform:(a,b)=>{if (b == "latitude" || b == "longitude"){return parseFloat(a)} else {return a}}});
        csv.data.forEach(item => {
            if (item.uprn == ""){
              return;
            }
            if (item.longitude < BOUNDS[0][1] || item.longitude > BOUNDS[1][1]){
              return;
            }
            if (item.latitude > BOUNDS[0][0] || item.latitude < BOUNDS[1][0]){
              return;
            }            
            UPRNLookup[item.uprn] = [item.latitude, item.longitude];
        })     
      } catch (error) {
        console.error(error.message);
      }
}

function scrOrDescr(UPRN){
  if (UPRN == null){
    return null;
  }
  UPRN = UPRN.trim();
  let newUPRN = new Array(12);
  for (let i = 0; i < UPRN.length; i++){
    let c = UPRN[i];
    if (i < 6){
      newUPRN[i] = c;
    } else {
      newUPRN[i] = c != "0" ? String(10 - parseInt(c)) : c;
    }
  }
  return newUPRN.join("")
}

async function tryLoadZipFromUrl(url) {
    console.log("Trying to load zip...")
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
                let newCertData = parse(await entry.getData(textWriter), {header:true});
                if (numberOfZipsLoaded == 0){
                  setCertificates(newCertData);
                } else {
                  appendToCertificates(newCertData);
                }
            break;
            case "columns.csv":
              let newColData = parse(await entry.getData(textWriter), {header:true});
              if (numberOfZipsLoaded == 0){
                columns = newColData;
              } else {
                columns.data = columns.data.concat(newColData.data);
              }
            break;
            case "recommendations.csv":
              let newRecsData = parse(await entry.getData(textWriter), {header:true});  //the LMK keys seem to be in order, so you could use binarysearch to get an answer pretty quickly from this
              if (numberOfZipsLoaded == 0){
                recommendations = newRecsData;
              } else {
                recommendations.data = recommendations.data.concat(newRecsData.data);
              }                
            break;
            case "schema.json":
                schema = JSON.parse(await entry.getData(textWriter));
            break;
            default:
            return;
        }
        numFilesProcessed++;
        if (numFilesProcessed == NUM_FILES_FOR_COMPLETE_READ){
            numberOfZipsLoaded++;
            console.log("Loaded "+numberOfZipsLoaded+"/"+numberOfZipsToLoad+" zips...")
            if (numberOfZipsLoaded == numberOfZipsToLoad){  //if we have completed loading all the zips that the user provided
                console.log("All zips loaded")
                console.log("Sorting certs by UPRN...")
                certificates.data.sort((a,b) => {
                  if (a.UPRN == b.UPRN){  //sort by UPRN and then lodgement date if the UPRNs are the same
                    let lodgeA = Date.parse(a.LODGEMENT_DATETIME);
                    let lodgeB = Date.parse(b.LODGEMENT_DATETIME);
                    return lodgeA == lodgeB ? 0 : (lodgeA < lodgeB ? -1 : 1);
                  } 
                  return a.UPRN < b.UPRN ? -1 : 1;
                });            
                console.log("Sorting recs by LMK key...")
                recommendations.data.sort((a,b) => {return a.LMK_KEY == b.LMK_KEY ? 0 : (a.LMK_KEY < b.LMK_KEY ? -1 : 1)});
                setMapInUse(USE_MAP_FOR_RENDER);
                await tryLoadUPRNLookup();
                geolocateDatapoints();
                sourceZips = null;
            } else if (numberOfZipsLoaded < numberOfZipsToLoad){ //otherwise load the next zip
              loadZipFileWithIndex(numberOfZipsLoaded);
            }
        }
      });
      await zipReader.close();
      veil.style = "display:none";
    } catch (error) {
      console.error(error.message);
    }
  }

  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);                    
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));     
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

  function geolocateDatapoints(){ //ONLY to be used the first time
        let UPRNkeys = Object.keys(UPRNLookup);
        let certsLength = certificates.data.length;

        let newCertsData = [];

        let numCertsSeen = 0;

        let numEntriesWithoutUPRN = 0;
        let failedDueToUPRNNotInDataset = 0;

        certificates.data.forEach(async (cert,index) => {
          
            let key = await sha256(scrOrDescr(cert.UPRN))

            let failed = false;

            if (cert.UPRN != undefined && cert.UPRN != "" && !UPRNkeys.includes(key)){ //If it does have a UPRN but it's outside the bounds, fail it. (If it doesn't have a UPRN at all, we can't fail or pass it so we keep it and put it in the ungeolocated list.)
              failedDueToUPRNNotInDataset++;
              failed = true;
            }

            if (!failed && index < certificates.data.length - 1 && certificates.data[index+1].UPRN == cert.UPRN && Date.parse(certificates.data[index+1].LODGEMENT_DATETIME) > Date.parse(cert.LODGEMENT_DATETIME)){
              failed = true; //and so in this case, we don't process this datapoint, because the one after it in the list is for the same building but more recent
            }
            
            if (!failed){
                if (index == parseInt(Math.floor(certsLength / 4))){
                    console.log("25% complete")
                } else if (index == parseInt(Math.floor(certsLength / 2))){
                    console.log("50% complete. We won't bother listing 75...")
                }
                newCertsData.push(cert);

                if (cert.UPRN == "" || cert.UPRN == undefined){
                  numEntriesWithoutUPRN++;
                } else {
                  cert.latLong = UPRNLookup[key];
                  cert.marker = makeCircleMarker(cert,null);
                }

                cert.recs = binarySearchByLMKAndReturnAllValidNeighbouringResults(recommendations.data, cert.LMK_KEY);
                if (cert.recs != null){
                  cert.recs.forEach(rec => {
                    cert["HAS_PAYBACK_"+rec.PAYBACK_TYPE.toUpperCase()] = true;
                    epcRecCategories.forEach(category => {
                      let codeLetter = rec.RECOMMENDATION_CODE[4];
                      if (codeLetter == undefined){
                        switch (rec.RECOMMENDATION_CODE){
                          case "USER":
                            if (!rec.RECOMMENDATION.includes("Insert Recommendation here")){
                              cert["REC_U"] = true;
                            }                        
                            break;
                          default:
                            alert("! unhandled epc code "+rec.RECOMMENDATION_CODE)
                          break;
                        }
                      } else if (codeLetter == category.internalName[4]){
                        cert[category.internalName] = true;
                      }   
                    });
                  });
                }
            }
            numCertsSeen++;

            if (numCertsSeen == certificates.data.length){
              console.log("Done. However, "+numEntriesWithoutUPRN+" entries out of "+ (numCertsSeen - failedDueToUPRNNotInDataset) +" valid entries did not have a UPRN associated with them, so will be only available to view in the address list below the map, and not on the map itself. "+failedDueToUPRNNotInDataset+" superfluous datapoints were discounted for not being in the viewed area (as intended).");
              onGeolocationComplete(newCertsData);
            }
        }); 
  }

  function onGeolocationComplete(newCertsData){
    certificates.data = null;
    certificates.data = newCertsData; //we transfer the new array (featuring only the target area) into certificates.data, just so that we're not holding the entire city in memory all the time
    UPRNLookup = null; //freeing up even more memory because we don't need to geolocate any more...
    recommendations.data = null;
    recommendations = null;
    mappableFactors.forEach((factor) => {
      factor.radioButton.disabled = false;
    });
    rerenderDatapoints();
  }

  function binarySearchByLMKAndReturnAllValidNeighbouringResults(arr, lmk){
      let i = parseInt(Math.floor(arr.length / 2));
      let lowerBound = 0;
      let upperBound = arr.length;
      let found = false;

      while (upperBound - lowerBound > 1){
        //check if we succeeded:
        if (lmk == arr[i].LMK_KEY){
          found = true;
          break;
        } else if (upperBound < arr.length && arr[upperBound].LMK_KEY == lmk){
          i = upperBound;
          found = true;
          break;
        } else if (arr[lowerBound].LMK_KEY == lmk){
          i = lowerBound;
          found = true;
          break;
        }
        //otherwise, update the bounds:
        if (lmk < arr[i].LMK_KEY){
          upperBound = i;
        } else {
          lowerBound = i;
        }
        i = parseInt(Math.floor((upperBound + lowerBound) / 2));
      }

      if (found){
        let orig_i = i;
        let itemsToReturn = [arr[orig_i]];
        //then check on either side of i to see if there are neighbouring rows with the same LMK number (very possible, because a place can have multiple recommendations)
        i--;
        while (i >= 0 && arr[i].LMK_KEY == lmk){
          itemsToReturn.push(arr[i]);
          i--;
        }
        i = orig_i + 1;
        while (i < arr.length && arr[i].LMK_KEY == lmk){
          itemsToReturn.push(arr[i]);
          i++;
        }
        
        return itemsToReturn.sort((a,b)=>{
          let payback_a = paybackTypes[a.PAYBACK_TYPE]; //get this as a number so that we can compare easily
          let payback_b = paybackTypes[b.PAYBACK_TYPE]; //get this as a number so that we can compare easily
          return payback_a == payback_b ? (a.RECOMMENDATION_ITEM == b.RECOMMENDATION_ITEM ? 0 : a.RECOMMENDATION_ITEM < b.RECOMMENDATION_ITEM ? -1 : 1) : (payback_a < payback_b ? -1 : 1);
        });
      }

      console.log("Couldn't find LMK key in recommendations: "+lmk);
      return null;
  }