const express = require('express')
const router = express.Router()

const axios = require('axios')
const proj4 = require('proj4')

const osApiKey = process.env.OS_API_KEY
const osSecret = process.env.OS_SECRET

const standardisedLocationFrom = entry => {
    proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs')
    const location = entry['GAZETTEER_ENTRY']
    if (location) {
        const validPlace = (location['TYPE'] == 'populatedPlace') || (location['LOCAL_TYPE'] == 'Postcode')
        if (validPlace) {
            var coords = proj4('EPSG:27700', 'EPSG:4326', [ location.GEOMETRY_X ?? 0, location.GEOMETRY_Y ?? 0 ]);
            var localeArray = []
            if (location['POPULATED_PLACE']) {
                localeArray.push(location['POPULATED_PLACE'])
            }
            if (location['DISTRICT_BOROUGH']) {
                localeArray.push(location['DISTRICT_BOROUGH'])
            }
            if (location['REGION']) {
                localeArray.push(location['REGION'])
            }
            const localeString = localeArray.join(', ')
            return {
                id: location["ID"],
                name: location["NAME1"],
                locale: localeString,
                isPostcode: location['LOCAL_TYPE'] == 'Postcode',
                location: coords
            }
        } else {
            return null
        }

    } else {
        return null
    }
}

router.post('/search', (req, res) => {
    const searchQuery = req.session.data['place-query']
    const nextPage = req.session.data['next-page']
    const errorPage = req.session.data['error-page']
    if (searchQuery) {
        axios.get('https://api.os.uk/search/names/v1/find?query=' + searchQuery + '&key=' + osApiKey)
        .then(response => {
            var data = response.data
            if (data.results.length) {
                let standardisedResults = data.results.map(result => standardisedLocationFrom(result)).filter(result => result != null)
                req.session.data.allPlaceResults = {}
                standardisedResults.forEach(result => {
                    req.session.data.allPlaceResults[result.id] = result
                })
                req.session.data.placeSearchTopResult = standardisedResults[0]
                req.session.data.placeSearchOtherResults = standardisedResults.slice(1, 11);
                if (req.session.data.placeSearchTopResult == null) {
                    throw new Error("No results")
                }
                req.session.data.placeSearchResponse = data
                res.redirect(nextPage)
            } else {
                res.redirect(errorPage)
            }
        }).catch(error => {
            console.log('Error', error.message)
            req.session.data.placeSearchResponse = error
            res.redirect(errorPage)
        })
    }
})

router.get('/select', (req, res) => {
    const selectedPlaceId = req.session.data['selected-id']
    const nextPage = req.session.data['next-page']
    const place = req.session.data.allPlaceResults[selectedPlaceId]
    const radius = place.isPostcode ? 0 : 6
    const floodAreaURL = `https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${place.location[1]}&long=${place.location[0]}&dist=${radius}`
    axios.get(floodAreaURL)
        .then(response => {
            const data = response.data
            const areas = data.items
            place.warningAreas = areas.filter(area => area.notation.includes('FWF'))
            place.alertAreas = areas.filter(area => area.notation.includes('WAF'))
            req.session.data.selectedPlace = place
            res.redirect(nextPage)
        })
})

module.exports = router