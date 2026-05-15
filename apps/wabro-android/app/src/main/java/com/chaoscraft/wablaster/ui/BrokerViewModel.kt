package com.chaoscraft.wablaster.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.chaoscraft.wablaster.db.BrokerRepository
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
@OptIn(ExperimentalCoroutinesApi::class)
class BrokerViewModel @Inject constructor(
    application: Application,
    private val repository: BrokerRepository
) : AndroidViewModel(application) {

    val allBrokers = repository.allBrokers
    val allGroups = repository.allGroups

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedCity = MutableStateFlow<String?>(null)
    val selectedCity: StateFlow<String?> = _selectedCity.asStateFlow()

    private val _selectedSpecialty = MutableStateFlow<String?>(null)
    val selectedSpecialty: StateFlow<String?> = _selectedSpecialty.asStateFlow()

    val filteredBrokers = combine(searchQuery, selectedCity, selectedSpecialty) { query, city, specialty ->
        Triple(query, city, specialty)
    }.flatMapLatest { (query, city, specialty) ->
        if (query.isNotBlank()) {
            // Search by name
            repository.searchByCityAndSpecialty(null, null).map { brokers ->
                brokers.filter {
                    it.name.contains(query, ignoreCase = true) ||
                    it.phone.contains(query) ||
                    it.city.contains(query, ignoreCase = true) ||
                    it.locality.contains(query, ignoreCase = true)
                }
            }
        } else if (city != null || specialty != null) {
            repository.searchByCityAndSpecialty(city, specialty)
        } else {
            repository.allBrokers
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setCityFilter(city: String?) {
        _selectedCity.value = city
    }

    fun setSpecialtyFilter(specialty: String?) {
        _selectedSpecialty.value = specialty
    }

    fun addOrUpdateBroker(broker: Broker) {
        viewModelScope.launch {
            repository.insertOrUpdate(broker)
        }
    }

    suspend fun getBrokerById(id: Long): Broker? = repository.getById(id)

    fun deleteBroker(broker: Broker) {
        viewModelScope.launch {
            repository.delete(broker)
        }
    }

    fun deactivateBroker(id: Long) {
        viewModelScope.launch {
            repository.deactivate(id)
        }
    }

    fun activateBroker(id: Long) {
        viewModelScope.launch {
            repository.activate(id)
        }
    }

    fun geoTagBroker(brokerId: Long, pincode: String) {
        viewModelScope.launch {
            repository.geoTagBroker(brokerId, pincode)
        }
    }

    // Groups

    private val _activeGroupId = MutableStateFlow<Long?>(null)
    val activeGroupId: StateFlow<Long?> = _activeGroupId.asStateFlow()

    fun createGroup(name: String, type: String = "CUSTOM") {
        viewModelScope.launch {
            repository.createGroup(name, type)
        }
    }

    fun deleteGroup(groupId: Long) {
        viewModelScope.launch {
            repository.deleteGroup(groupId)
        }
    }

    fun addBrokersToGroup(brokerIds: List<Long>, groupId: Long) {
        viewModelScope.launch {
            repository.addBrokersToGroup(brokerIds, groupId)
        }
    }

    fun removeBrokerFromGroup(brokerId: Long, groupId: Long) {
        viewModelScope.launch {
            repository.removeBrokerFromGroup(brokerId, groupId)
        }
    }

    fun getGroupBrokers(groupId: Long) = repository.getBrokersInGroup(groupId)

    // Bulk import
    fun importBrokers(brokers: List<Broker>) {
        viewModelScope.launch {
            repository.insertAll(brokers)
        }
    }

    // Stats
    val totalBrokerCountFlow = repository.allBrokers.map { it.size }
}
