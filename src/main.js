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

const paybackTypes = {"short":0, "SHORT":0, "medium":1, "MEDIUM":1, "long":2, "LONG":2, "other":3, "OTHER":3};

let epcRecsFiltersElement = document.getElementById("epc-recs-filters");

let epcRecCategories = {
  "Cooling":null,
  "Hot Water":null,
  "Envelope":null,
  "Fuel-switching":null,
  "Heating":null,
  "Lighting":null,
  "Overheating":null,
  "Renewable energy":null
}

Object.keys(epcRecCategories).forEach(category => {
  let div = document.createElement("div");
  let checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.id = "checkbox-"+category;
  checkbox.oninput = () => {alert("Need to actually wire this up to change the map")};
  let label = document.createElement("label");
  label.innerText = category;
  label.setAttribute("for",checkbox.id);
  div.appendChild(checkbox);
  div.appendChild(label);
  epcRecsFiltersElement.appendChild(div);
});

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
            let latLong = UPRNLookup[cert.UPRN];
            L.circleMarker(latLong, {
                radius : 5,
                fillColor: '#0000ff',                
                fillOpacity: 0.9,
                opacity: 0,
              }).on("click",()=>{loadStatsIntoPanel(cert); map.flyTo(latLong, 18);}).addTo(map);
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
  
function createHTMLfromRecs(recs){

  let table = document.createElement("table");
  let thead = document.createElement("thead");
  thead.innerHTML = "<th>Recommendation</th><th style='padding:0em 0.5em;'>Payback time</th><th style='padding:0em 0.5em;'>CO2 impact</th>";
  table.appendChild(thead);

  let instanceCountOfPaybackTypes = {}

  recs.forEach(rec => {
      if (instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] == null){
        instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] = 1;
      } else {
        instanceCountOfPaybackTypes[rec.PAYBACK_TYPE]++;
      }
  });

  recs.forEach(rec => {
    let tr = document.createElement("tr");        
    tr.innerHTML = "<td>"+rec.RECOMMENDATION+"</td>";
    if (instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] != null){
      tr.innerHTML += "<td style='text-align:center;'; rowspan='"+instanceCountOfPaybackTypes[rec.PAYBACK_TYPE]+"'>"+rec.PAYBACK_TYPE.toUpperCase()+"</td>";
      instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] = null;
    }
    tr.innerHTML += "<td style='text-align:center;'>"+rec.CO2_IMPACT+"</td>";
    table.appendChild(tr);
  })

  return table;
}

function loadStatsIntoPanel(cert){
  let LMK = cert.LMK_KEY;
  let recs = binarySearchByLMKAndReturnAllValidNeighbouringResults(recommendations.data, LMK);
  recsArea.innerHTML = "";
  let h4 = document.createElement("h4");
  h4.innerText ="For UPRN "+cert.UPRN+":";
  recsArea.appendChild(h4);
  recsArea.appendChild(createHTMLfromRecs(recs));
}