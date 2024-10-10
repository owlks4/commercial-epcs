import { rerenderDatapoints, requiredRecTextPhrase } from "./mapDataRender.js";

let epcRecsFiltersElement = document.getElementById("epc-recs-filters");

const shortPaybackCheckbox = document.getElementById("payback-time-short-checkbox");
const mediumPaybackCheckbox = document.getElementById("payback-time-medium-checkbox");
const longPaybackCheckbox = document.getElementById("payback-time-long-checkbox");
const otherPaybackCheckbox = document.getElementById("payback-time-other-checkbox");
const lowCO2ImpactCheckbox = document.getElementById("co2-impact-low-checkbox");
const mediumCO2ImpactCheckbox = document.getElementById("co2-impact-medium-checkbox");
const highCO2ImpactCheckbox = document.getElementById("co2-impact-high-checkbox");

[shortPaybackCheckbox,mediumPaybackCheckbox,longPaybackCheckbox,otherPaybackCheckbox,
  lowCO2ImpactCheckbox,mediumCO2ImpactCheckbox,highCO2ImpactCheckbox].forEach(
  (checkbox) => {
  checkbox.checked = true;
  checkbox.oninput = () => {rerenderDatapoints();};
  }
);

function isFilterCheckboxCheckedForPaybackType(type){
  switch (type){
    case "SHORT":
      return shortPaybackCheckbox.checked;
    case "MEDIUM":
      return mediumPaybackCheckbox.checked;
    case "LONG":
      return longPaybackCheckbox.checked;
    case "OTHER":
      return otherPaybackCheckbox.checked;
    default:
      alert("Unhandled payback time type!")
      return null;
  }
}

function isFilterCheckboxCheckedForCO2Impact(impact){
  switch (impact){
    case "LOW":
      return lowCO2ImpactCheckbox.checked;
    case "MEDIUM":
      return mediumCO2ImpactCheckbox.checked;
    case "HIGH":
      return highCO2ImpactCheckbox.checked;
    default:
      alert("Unhandled CO2 impact type: "+impact)
      return null;
  }
}

function shouldRecBeHighlighted(rec){
    return getEPCRecCategoryByCode(rec.RECOMMENDATION_CODE).show && isFilterCheckboxCheckedForCO2Impact(rec.CO2_IMPACT.toUpperCase()) && isFilterCheckboxCheckedForPaybackType(rec.PAYBACK_TYPE.toUpperCase()) && (requiredRecTextPhrase == null ? true : rec.RECOMMENDATION.toUpperCase().includes(requiredRecTextPhrase));
  }
  
  class EPCRecCategory {
    constructor(displayName, internalName, show){
      this.displayName = displayName;
      this.internalName = internalName;
      this.show = show;
    }
  }
  
  let epcRecCategories = [
    new EPCRecCategory("Cooling","REC_C", true),
    new EPCRecCategory("Hot water","REC_W", true),
    new EPCRecCategory("Envelope","REC_E", true),
    new EPCRecCategory("Fuel-switching","REC_F", true),
    new EPCRecCategory("Heating","REC_H", true),
    new EPCRecCategory("Lighting","REC_L", true),
    new EPCRecCategory("Overheating","REC_V", true),
    new EPCRecCategory("Renewable energy","REC_R", true),
    new EPCRecCategory("Comment","REC_U", true),
  ]
  
  function getEPCRecCategoryByCode(code){
    if (code[4] == undefined){
      if (code == "USER"){
        return getEPCRecCategoryByInternalName("REC_U");
      }
    }
    for (let i = 0; i < epcRecCategories.length; i++){
      if (epcRecCategories[i].internalName[4] == code[4]){
        return epcRecCategories[i];
      }
    }
    return null;
  }
  
  function getEPCRecCategoryByInternalName(name){
    for (let i = 0; i < epcRecCategories.length; i++){
      if (epcRecCategories[i].internalName == name){
        return epcRecCategories[i];
      }
    }
    return null;
  }
  
  epcRecCategories.forEach(category => {
    let div = document.createElement("div");
    let checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.id = "checkbox-"+category.internalName;
    checkbox.oninput = (e) => {category.show = e.target.checked; rerenderDatapoints();};
    let label = document.createElement("label");
    label.innerText = category.displayName;
    label.setAttribute("for",checkbox.id);
    div.appendChild(checkbox);
    div.appendChild(label);
    epcRecsFiltersElement.appendChild(div);
  });

export {epcRecCategories, shouldRecBeHighlighted, shortPaybackCheckbox ,mediumPaybackCheckbox, longPaybackCheckbox, otherPaybackCheckbox}