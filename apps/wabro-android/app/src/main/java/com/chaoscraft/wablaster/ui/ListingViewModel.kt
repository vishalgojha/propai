package com.chaoscraft.wablaster.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.chaoscraft.wablaster.db.ListingRepository
import com.chaoscraft.wablaster.db.entities.Deal
import com.chaoscraft.wablaster.db.entities.Listing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
@OptIn(ExperimentalCoroutinesApi::class)
class ListingViewModel @Inject constructor(
    application: Application,
    private val repository: ListingRepository
) : AndroidViewModel(application) {

    val allListings = repository.allListings
    val activeListings = repository.activeListings

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedCity = MutableStateFlow<String?>(null)
    val selectedCity: StateFlow<String?> = _selectedCity.asStateFlow()

    private val _selectedType = MutableStateFlow<String?>(null)
    val selectedType: StateFlow<String?> = _selectedType.asStateFlow()

    val filteredListings = combine(searchQuery, selectedCity, selectedType) { query, city, type ->
        Triple(query, city, type)
    }.flatMapLatest { (query, city, type) ->
        if (city != null || type != null) {
            repository.searchActive(
                if (city?.isEmpty() == true) null else city,
                if (type?.isEmpty() == true) null else type
            )
        } else if (query.isNotBlank()) {
            repository.activeListings.map { listings ->
                listings.filter {
                    it.name.contains(query, ignoreCase = true) ||
                    it.projectName.contains(query, ignoreCase = true) ||
                    it.city.contains(query, ignoreCase = true) ||
                    it.locality.contains(query, ignoreCase = true)
                }
            }
        } else {
            repository.activeListings
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    suspend fun getById(id: Long) = repository.getById(id)

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun addOrUpdateListing(listing: Listing) {
        viewModelScope.launch {
            repository.insertOrUpdate(listing)
        }
    }

    fun updateStatus(id: Long, status: String) {
        viewModelScope.launch {
            repository.updateStatus(id, status)
        }
    }

    // Deals
    fun getDealsByCampaign(campaignId: Long) = repository.getDealsByCampaign(campaignId)

    fun getDealsByBroker(brokerId: Long) = repository.getDealsByBroker(brokerId)

    fun recordDeal(
        campaignId: Long,
        listingId: Long,
        brokerId: Long,
        clientName: String,
        clientPhone: String,
        dealValue: Double,
        commissionRate: Double,
        commissionAmount: Double
    ) {
        viewModelScope.launch {
            repository.recordDeal(
                campaignId = campaignId,
                listingId = listingId,
                brokerId = brokerId,
                clientName = clientName,
                clientPhone = clientPhone,
                dealValue = dealValue,
                commissionRate = commissionRate,
                commissionAmount = commissionAmount
            )
        }
    }

    fun updateDealStage(dealId: Long, stage: String) {
        viewModelScope.launch {
            repository.updateDealStage(dealId, stage)
        }
    }

    fun markDealWon(dealId: Long) {
        viewModelScope.launch {
            repository.markDealWon(dealId)
        }
    }

    fun markDealLost(dealId: Long) {
        viewModelScope.launch {
            repository.markDealLost(dealId)
        }
    }

    fun markCommissionPaid(dealId: Long) {
        viewModelScope.launch {
            repository.markCommissionPaid(dealId)
        }
    }

    fun getTotalPaidCommission(brokerId: Long): Flow<Double> =
        repository.getTotalPaidCommission(brokerId)

    fun getTotalPendingCommission(brokerId: Long): Flow<Double> =
        repository.getTotalPendingCommission(brokerId)

    val pendingCommissionDeals = repository.getPendingCommission()
    val paidCommissionDeals = repository.getPaidCommission()
}
