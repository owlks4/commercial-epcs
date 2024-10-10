import { mappableFactors, ungeolocatedResultsControl, composeAddress, spawnMapControls } from "./mapControls.js";
import {epcRecCategories, shouldRecBeHighlighted, shortPaybackCheckbox,mediumPaybackCheckbox,longPaybackCheckbox,otherPaybackCheckbox} from "./recFilterManager.js";

let USE_MAP_FOR_RENDER = false; //whether we should use the map as the rendering output (otherwise we default to the list)

function setMapInUse(b){
  USE_MAP_FOR_RENDER = b;

  if (USE_MAP_FOR_RENDER){
    document.getElementById("map-parent").style = "";
    document.getElementById("list").style = "display:none;";
    map.invalidateSize();
    document.getElementById("list-content").innerHTML = "";
  } else {
    document.getElementById("map-parent").style = "display:none;";
    document.getElementById("list").style = "";
    map.invalidateSize();
  }
  rerenderDatapoints();  
}

let map = null;
let certificates = null;
let mostRecentlySelectedCert = null;
let recsArea = document.getElementById("recs-area");

function setCertificates(c){
    certificates = c;
}

function appendToCertificates(newCerts){
  certificates.data = certificates.data.concat(newCerts.data);
}

function setMapRenderVars(_map){
    map = _map;
}

function rerenderDatapoints(){

    let ungeolocatedResults = [];

    let factorToMap = null;

    for (let i = 0; i < mappableFactors.length; i++){
      if (mappableFactors[i].radioButton != null && mappableFactors[i].radioButton.checked){
        factorToMap = mappableFactors[i];
      }
    }

    if (factorToMap != null && factorToMap.internalName == "NONE"){
      factorToMap = null;
    }

    certificates.data.forEach((cert,index) => {

      //check if the datapoint is eligible for being shown right now, based on the filters that the user has checked:

      let shouldShowBasedOnEPC = false;
      let shouldShowBasedOnPaybackTime = false;

      epcRecCategories.forEach(category => {
        if (category.show && cert[category.internalName] != null && cert[category.internalName]){
          shouldShowBasedOnEPC = true;
        }                
      });

      if (cert.HAS_PAYBACK_SHORT && shortPaybackCheckbox.checked){ //technically these aren't exclusive - a cert can have both a short payback and a long payback - but it doesn't matter which one or how many, as long as the viewer has selected filters that encompass at least one of them. So this exclusionary-looking elseif is actually fine.
        shouldShowBasedOnPaybackTime = true;
      } else if (cert.HAS_PAYBACK_MEDIUM && mediumPaybackCheckbox.checked){
        shouldShowBasedOnPaybackTime = true;
      } else if (cert.HAS_PAYBACK_LONG && longPaybackCheckbox.checked){
        shouldShowBasedOnPaybackTime = true;
      } else if (cert.HAS_PAYBACK_OTHER && otherPaybackCheckbox.checked){
        shouldShowBasedOnPaybackTime = true;
      }

      if (!(shouldShowBasedOnEPC && shouldShowBasedOnPaybackTime)){ //we should not present this marker at all
        if (cert.marker != null) { //marker exists but should not be present, so get rid of it
          map.removeLayer(cert.marker);
          cert.marker = null;
        }
        return;
      }

      //check the legend checkboxes (EPC rating etc)

      for (let i = 0; i < mappableFactors.length; i++){
        let factor = mappableFactors[i];

        if (factor.internalName != "NONE" && factor.radioButton != null && factor.radioButton.checked){
          if (!factor.checkedSubBoxes[cert[factor.internalName]]){ //then it fails the check
            if (cert.marker != null) { //remove its marker if it exists
              map.removeLayer(cert.marker);
              cert.marker = null;
            }
            return;
          }
          break;
        }
      }

      //if we reach this point, there's a chance that we should present this marker, but we haven't checked that the correct payback and the correct code occur in the same item yet, so we do that now:

      let isTrulyValid = false;

      for (let i = 0; i < cert.recs.length; i++){ //if ANY REC in the cert is active under the current filter criteria
        if (shouldRecBeHighlighted(cert.recs[i])){
          isTrulyValid = true;
          break;
        }
      }

      if (cert.marker != null){ //delete the old one to ensure that it gets its new colour if required, when it's recreated immediately afterwards
        map.removeLayer(cert.marker);
        cert.marker = null;
      }
      
      if (isTrulyValid){ //if the item still passes all the criteria
        if (cert.latLong == null || !USE_MAP_FOR_RENDER){ //then we can't actually put it on the map so add it to the unmappable addresses list
          ungeolocatedResults.push(cert);
        } else {
          cert.marker = makeCircleMarker(cert, factorToMap).addTo(map);  //then we succeed in our preferred option of mapping the item        
        }        
      }
    });

    if (mostRecentlySelectedCert != null){
      loadStatsIntoPanel(mostRecentlySelectedCert, true);
    }

    if (USE_MAP_FOR_RENDER){ //if the map is in use, any ungeolocated addresses are sent to the control on the map
      ungeolocatedResultsControl.update(ungeolocatedResults, factorToMap);
    } else { //otherwise, the ungeolocated addresses (i.e. all of them, because we have no map) are sent to the list
      document.getElementById("list-content").innerHTML = "";
      let list = getAsHTMLList(ungeolocatedResults, factorToMap, 2500);
      list.className = "html-list-hero";
      document.getElementById("list-content").appendChild(list);
    }    
  }

  function makeCircleMarker(cert, factorToMap){

    let fillCol = '#0000ff';
    let factorValue = null;

    if (factorToMap != null){
      factorValue = cert[factorToMap.internalName];
      fillCol = factorToMap.getColorForValue(factorValue);
    }

    let circleMarker = L.circleMarker(cert.latLong, {
      radius : 5,
      fillColor: fillCol,                
      fillOpacity: 0.9,
      color: "black",
      weight:1,
      opacity: factorToMap == null ? 0 : 0.9,
      interactive:true
    }).on("click",generateOnClickFunctionForCert(cert)).addTo(map);

    if (factorValue != null){
      if (factorToMap.categoricTooltipTexts != null){
        circleMarker.bindTooltip(factorToMap.categoricTooltipTexts[String(factorValue)])
      } else {
        circleMarker.bindTooltip(factorToMap.displayName +": "+String(factorValue))
      }     
    }

    return circleMarker;
  }

  function generateOnClickFunctionForCert(cert){
    return ()=>{
      loadStatsIntoPanel(cert, false);
      map.flyTo(cert.latLong, 18);
    }
}

function loadStatsIntoPanel(cert, isRerender){
  mostRecentlySelectedCert = cert;
  recsArea.innerHTML = "";
  if (cert.UPRN != "" && cert.UPRN != null){
    let h4 = document.createElement("h4");
    h4.innerText ="For UPRN "+cert.UPRN;
    h4.style = "margin-bottom:0;"
    recsArea.appendChild(h4);
  }
  let otherH4 = document.createElement("h4");
  otherH4.innerText = composeAddress(cert);
  otherH4.style = "margin-bottom:0;"
  recsArea.appendChild(otherH4);
  let inspectionDate = document.createElement("h4");
  inspectionDate.style = "font-size:0.9em;"
  inspectionDate.innerText = "(Inspected "+cert.INSPECTION_DATE+")";
  recsArea.appendChild(inspectionDate);
  if (!isRerender){
    recsArea.scrollTop = 0;
  }
  if (cert.recs == null){
    let div = document.createElement("div");
    div.style = "color:black;";
    div.innerHTML = "Apparently, this datapoint didn't have any EPC recommendations.<br>(Either that, or there was an LMK key match failure)";
    recsArea.appendChild(div);
  } else {
    recsArea.appendChild(createHTMLfromRecs(cert.recs));
  }
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
    let recCategoryIsHighlighted = shouldRecBeHighlighted(rec);
    let tr = document.createElement("tr");
    let recText = rec.RECOMMENDATION;
    if (recText == "Insert Recommendation here"){
      recText += " [sic]"
    }
    tr.innerHTML = (recCategoryIsHighlighted?"<td style='background-color:#f7f7a1;'>":"<td>")+recText+"</td>";
    if (instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] != null){
      tr.innerHTML += "<td style='text-align:center;'; rowspan='"+instanceCountOfPaybackTypes[rec.PAYBACK_TYPE]+"'>"+rec.PAYBACK_TYPE.toUpperCase()+"</td>";
      instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] = null;
    }
    tr.innerHTML += "<td style='text-align:center;'>"+rec.CO2_IMPACT+"</td>";
    table.appendChild(tr);
  })

  return table;
}

function getAsHTMLList(ungeolocatedResults, factorToMap, displayLimit){ //this is the non-map version. If there IS a map in use, then ungeolocated results will have been sent to the list view
  if (ungeolocatedResults.length == 0){
    let div = document.createElement("div");
    div.style = "padding-left:10px;"
    div.innerText = "Either loading (in which case please wait a few seconds) OR no valid results - if the latter, please expand your filter requirements."
    return div;
  }

  let list = document.createElement("ul");

  if (ungeolocatedResults.length > displayLimit){
    list.innerHTML = "<strong><br>"+ungeolocatedResults.length +" results (which is above our display limit of "+displayLimit+",<br>so apply some filters first to see them in this list)</strong>";
  } else {
    list.innerHTML = "";
    list.scrollTop = 0;        
    if (factorToMap == null){
      ungeolocatedResults.sort((a,b)=>{return a.ADDRESS.localeCompare(b.ADDRESS)}); //sort alphabetically if there are no factor values involved
    } else {
      ungeolocatedResults.sort((a,b)=>{  //but if there are, sort by factor value
        let aVal = a[factorToMap.internalName];
        let bVal = b[factorToMap.internalName];    
        return aVal == bVal ? 0 : (aVal < bVal ? -1 : 1);
      });
    }
    ungeolocatedResults.forEach((cert) => {
      let li = document.createElement("li");
      li.className = "ungeolocatable-list-item"
      li.innerText = composeAddress(cert);
      if (factorToMap != null){
        let factorValue = cert[factorToMap.internalName];
        li.style = "background-color:"+factorToMap.getColorForValue(factorValue);
        li.title = factorToMap.displayName +": "+String(factorValue);
      }
      li.onclick = () => {loadStatsIntoPanel(cert,false);}
      list.appendChild(li);
    });
  }

  list.style = "color:black; overflow:hidden auto; margin:0;max-height:50vh;";
  return list;
}

export {rerenderDatapoints,setMapRenderVars,certificates,setCertificates,appendToCertificates,makeCircleMarker,loadStatsIntoPanel,getAsHTMLList,setMapInUse,USE_MAP_FOR_RENDER}