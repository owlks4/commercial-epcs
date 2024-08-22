import './style.css'
import 'leaflet'
import "leaflet-providers";
import { ZipReader, BlobReader, TextWriter} from '@zip.js/zip.js';
import { parse } from 'papaparse';


let BOUNDS = [[52.470929538389235, -1.8681315185627474],[52.445207838077096, -1.806846604153346]];
var map = L.map('map').setView([(BOUNDS[0][0] + BOUNDS[1][0]) / 2, (BOUNDS[0][1] + BOUNDS[1][1]) / 2]).fitBounds(BOUNDS);

let recsArea = document.getElementById("recs-area");

L.tileLayer.provider("OpenStreetMap.Mapnik").addTo(map);

let UPRNLookup = {};
let certificates = null;
let columns = null;
let recommendations = null;
let schema = null;

const paybackTypes = {"SHORT":0, "MEDIUM":1, "LONG":2};

tryLoadUPRNLookup();

async function tryLoadUPRNLookup(){
    const url = "./UPRNlookup.csv";
    try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Response status: ${response.status}`);
        }
        console.log("Loading UPRN lookup...")
        const csv = parse(await response.text(),{header:true, transform:(a,b)=>{if (b == "latitude" || b == "longitude"){return parseFloat(a)} else {return a}}});
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
            console.log("Sorting recs by LMK key...")
            recommendations.data.sort((a,b) => {return a.LMK_KEY == b.LMK_KEY ? 0 : (a.LMK_KEY < b.LMK_KEY ? -1 : 1)});
            console.log(recommendations);
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
              }).on("click",()=>{loadStatsIntoPanel(cert)}).addTo(map);
        });
        console.log("Done");
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

function appendOrderedListOfType(div,recs,type){
    let h4 = document.createElement("h4");
    h4.innerText = type+" payback time:";
    div.appendChild(h4);
    let table = document.createElement("table");
    let thead = document.createElement("thead");
    thead.innerHTML = "<th>#</th><th>Recommendation</th><th>CO2 impact</th>";
    table.appendChild(thead);
    let i = 1;
    recs.forEach(rec => {
      if (rec.PAYBACK_TYPE.toLowerCase() == type.toLowerCase()){
        let tr = document.createElement("tr");        
        tr.innerHTML = "<td>"+i+"</td><td>"+rec.RECOMMENDATION+"</td><td>"+rec.CO2_IMPACT+"</td>";
        table.appendChild(tr);
        i++;
    }
  });
  div.appendChild(table);
}
  
function createHTMLfromRecs(recs){

  let uniquePaybackTypes = [];

  let div = document.createElement("div");

  recs.forEach(rec => {
    if (!uniquePaybackTypes.includes(rec.PAYBACK_TYPE)){
      uniquePaybackTypes.push(rec.PAYBACK_TYPE)
    }
  })

  uniquePaybackTypes.forEach(paybackType => {
    appendOrderedListOfType(div,recs,paybackType);
  })

  return div;
}

function loadStatsIntoPanel(cert){
  let LMK = cert.LMK_KEY;
  let recs = binarySearchByLMKAndReturnAllValidNeighbouringResults(recommendations.data, LMK);
  recsArea.innerHTML = "";
  recsArea.appendChild(createHTMLfromRecs(recs));
}